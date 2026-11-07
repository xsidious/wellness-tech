"use server";

import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { encryptField, hashKey, rejectCardNumber, tokenizeLast4 } from "@/lib/crypto";
import { clearLogin, readPending, readUserId, setLogin, setPending } from "@/lib/session";
import { canOrder, fulfillmentGroups, isProductClass, requiresEscript, shippingCents } from "@/lib/rules";
import { ensurePharmacyNetwork } from "@/lib/ensure-pharmacies";
import { createExternalOrder, emitOrderEvent, ensurePatient, nextEvent, openRxcoreOrder } from "@/lib/rxcore";
import { rolesOf } from "@/lib/guard";
import { honeypotTripped, verifyTurnstile } from "@/lib/anti-bot";
import { sendMagicLoginCode } from "@/lib/email";
import {
  assertNotLockedOut,
  assertNotRateLimited,
  assertSameOrigin,
  assertStrongPassword,
  genericAuthError,
  recordLoginFailure,
  recordLoginSuccess,
  requestClientMeta,
} from "@/lib/auth-security";

function sandboxAuthEnabled() {
  return (process.env.SANDBOX_AUTH || "").trim().toLowerCase() === "true";
}

function paymentsSandboxEnabled() {
  const mode = (process.env.PAYMENTS_MODE || "").trim().toLowerCase();
  if (mode === "live" || mode === "production") return false;
  if (mode === "sandbox") return true;
  return sandboxAuthEnabled() || (process.env.PAYMENTS_SANDBOX || "true").trim().toLowerCase() !== "false";
}

function homePathForRoles(rolesRaw: string) {
  const roles = rolesOf(rolesRaw);
  if (roles.includes("admin") && !roles.some((r) => ["owner", "prescriber", "staff"].includes(r))) return "/admin";
  if (roles.includes("pharmacy") && !roles.some((r) => ["owner", "prescriber", "staff", "admin"].includes(r))) {
    return "/pharmacy";
  }
  if (roles.includes("patient")) return "/patient/portal";
  return "/portal";
}

/** Only echo codes in the UI when explicitly sandboxed. Live always emails the code. */
function sandboxCode(code: string) {
  return sandboxAuthEnabled() ? code : "";
}

function signInError(error: unknown) {
  if (typeof error === "object" && error && "digest" in error && String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) {
    throw error;
  }
  const message = error instanceof Error ? error.message.replace(/\s+/g, " ").trim() : "";
  if (!message || /url|password|postgres|secret|credential|database|prisma|connect/i.test(message)) {
    return "Sign-in cannot reach the database right now.";
  }
  return message.slice(0, 180);
}

/** Staff admin login — password + bot check + lockout. */
export async function adminPasswordLogin(formData: FormData) {
  const meta = await requestClientMeta();
  try {
    if (honeypotTripped(formData)) return { error: "Unable to sign in." };
    const originCheck = assertSameOrigin(meta);
    if (!originCheck.ok) return { error: originCheck.error };

    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");
    const turnstile = String(formData.get("cf-turnstile-response") || "");
    if (!email.includes("@") || password.length < 8) return { error: "Enter admin email and password." };

    const limited = await assertNotRateLimited(meta.ip, email);
    if (!limited.ok) return { error: limited.error };
    const locked = await assertNotLockedOut(email);
    if (!locked.ok) return { error: locked.error };

    const bot = await verifyTurnstile(turnstile, meta.ip);
    if (!bot.ok) return { error: bot.error || "Bot check failed." };

    const user = await prisma.user.findUnique({ where: { email } });
    const okAdmin = Boolean(user?.passwordHash && rolesOf(user.roles).includes("admin"));
    const okPass = okAdmin && user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !okAdmin || !okPass) {
      await recordLoginFailure(email, meta.ip, "admin_invalid");
      return { error: "Invalid admin credentials." };
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await recordLoginSuccess(user.id, user.email, meta.ip, "admin_password", meta.ua);
    await setLogin(user.id);
    const next = String(formData.get("next") || "");
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
    redirect(safeNext.startsWith("/admin") ? safeNext : "/admin");
  } catch (error) {
    return { error: signInError(error) };
  }
}

async function passwordMatchesUser(user: { passwordHash: string; mfaHash: string }, password: string) {
  if (user.passwordHash) {
    if (await bcrypt.compare(password, user.passwordHash)) return true;
  }
  // Sandbox-only bridge: old demo accounts that only stored a PIN.
  if (sandboxAuthEnabled() && user.mfaHash && /^\d{6}$/.test(password)) {
    return bcrypt.compare(password, user.mfaHash);
  }
  return false;
}

/**
 * Practice / affiliate login: email + password, then PIN when MFA is enabled.
 * Lockout, origin check, Turnstile (when configured), and audit trails apply.
 */
export async function practicePasswordLogin(formData: FormData) {
  const meta = await requestClientMeta();
  try {
    if (honeypotTripped(formData)) return { error: "Unable to sign in." };
    const originCheck = assertSameOrigin(meta);
    if (!originCheck.ok) return { error: originCheck.error };

    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");
    const turnstile = String(formData.get("cf-turnstile-response") || "");
    if (!email.includes("@") || password.length < 8) {
      return { error: "Enter your email and password." };
    }

    const limited = await assertNotRateLimited(meta.ip, email);
    if (!limited.ok) return { error: limited.error };
    const locked = await assertNotLockedOut(email);
    if (!locked.ok) return { error: locked.error };

    const bot = await verifyTurnstile(turnstile, meta.ip);
    if (!bot.ok) return { error: bot.error || "Bot check failed." };

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await passwordMatchesUser(user, password))) {
      await recordLoginFailure(email, meta.ip, "practice_invalid");
      // Uniform message — do not reveal whether the email exists.
      return { error: genericAuthError() };
    }

    // Always step-up when a PIN factor exists (ignore stale mfaEnabled=false).
    if (user.mfaHash) {
      await setPending(email);
      if (!user.mfaEnabled) {
        await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
      }
      await audit({
        actorId: user.id,
        action: "auth.password_ok_awaiting_mfa",
        object: user.email,
        ip: meta.ip,
      });
      return { next: "mfa" as const, email };
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await recordLoginSuccess(user.id, user.email, meta.ip, "practice_password", meta.ua);
    await setLogin(user.id);

    const next = String(formData.get("next") || "");
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "";
    const home = homePathForRoles(user.roles);
    redirect(safeNext || home);
  } catch (error) {
    return { error: signInError(error) };
  }
}

export async function requestMagic(formData: FormData) {
  if (honeypotTripped(formData)) return { error: "Unable to send code." };
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email.includes("@")) return { error: "Enter a valid email." };
  try {
    const recent = await prisma.magicCode.count({
      where: { email, createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) } },
    });
    if (recent >= 5) return { error: "Too many codes. Wait a few minutes." };
    const code = String(randomInt(100000, 999999));
    await prisma.magicCode.create({
      data: {
        email,
        codeHash: await bcrypt.hash(code, 8),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    try {
      await sendMagicLoginCode(email, code);
    } catch (error) {
      // Live login requires email delivery. Sandbox can still show the code on-screen.
      if (!sandboxAuthEnabled()) {
        return { error: "Could not send the login email. Try again shortly." };
      }
      console.error("Magic code email failed in sandbox:", error);
    }
    await audit({ action: "auth.code_sent", object: email });
    return { code: sandboxCode(code), email };
  } catch (error) {
    return { error: signInError(error) };
  }
}

export async function verifyMagic(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const code = String(formData.get("code") || "").trim();
  try {
    const row = await prisma.magicCode.findFirst({
      where: { email, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!row || !(await bcrypt.compare(code, row.codeHash))) {
      return { error: "That code is not valid." };
    }
    await prisma.magicCode.update({ where: { id: row.id }, data: { used: true } });
    await setPending(email);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return { next: "signup" as const, email };
    if (!user.mfaEnabled) return { next: "mfa-setup" as const, email };
    return { next: "mfa" as const, email };
  } catch (error) {
    return { error: signInError(error) };
  }
}

export async function confirmMfa(formData: FormData) {
  const meta = await requestClientMeta();
  try {
    const email = await readPending();
    const pin = String(formData.get("pin") || "").trim();
    if (!email) return { error: "Start again from email and password." };
    if (!/^\d{6}$/.test(pin)) return { error: "The second factor is 6 digits." };

    const limited = await assertNotRateLimited(meta.ip, `mfa:${email}`);
    if (!limited.ok) return { error: limited.error };

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.mfaHash) return { error: "Set up the second factor first." };
    if (!(await bcrypt.compare(pin, user.mfaHash))) {
      await recordLoginFailure(email, meta.ip, "mfa_invalid");
      return { error: "That PIN does not match." };
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await recordLoginSuccess(user.id, user.email, meta.ip, "password_plus_mfa", meta.ua);
    await setLogin(user.id);
    const next = String(formData.get("next") || "");
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "";
    redirect(safeNext || homePathForRoles(user.roles));
  } catch (error) {
    return { error: signInError(error) };
  }
}

export async function completeSignup(formData: FormData) {
  const meta = await requestClientMeta();
  if (honeypotTripped(formData)) return { error: "Unable to create account." };
  const originCheck = assertSameOrigin(meta);
  if (!originCheck.ok) return { error: originCheck.error };

  const pendingEmail = await readPending();
  const email = (pendingEmail || String(formData.get("email") || "")).trim().toLowerCase();
  if (!email.includes("@")) return { error: "Enter a valid email." };
  const name = String(formData.get("name") || "").trim();
  const legalName = String(formData.get("legalName") || "").trim();
  const accountType = String(formData.get("accountType") || "practice");
  const password = String(formData.get("password") || "");
  const pin = String(formData.get("pin") || "").trim();
  const ref = String(formData.get("ref") || "").trim().toUpperCase();
  const turnstile = String(formData.get("cf-turnstile-response") || "");
  if (name.length < 2 || legalName.length < 2) return { error: "Name and organization are required." };
  const strong = assertStrongPassword(password);
  if (!strong.ok) return { error: strong.error };
  if (!/^\d{6}$/.test(pin)) return { error: "Choose a 6-digit security PIN (second factor)." };

  const bot = await verifyTurnstile(turnstile, meta.ip);
  if (!bot.ok) return { error: bot.error || "Bot check failed." };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "That email already has an account. Sign in instead." };

  let referringAffiliateId = "";
  let parentAffiliateProfileId: string | null = null;
  if (ref) {
    const affiliate = await prisma.affiliateProfile.findUnique({ where: { code: ref } });
    if (affiliate) {
      referringAffiliateId = affiliate.userId;
      if (accountType === "affiliate") parentAffiliateProfileId = affiliate.id;
    }
  }
  const roles =
    accountType === "affiliate"
      ? ["affiliate"]
      : accountType === "telehealth"
        ? ["owner", "api_client"]
        : ["owner", "prescriber"];
  const slugBase = legalName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "org";
  const org = await prisma.organization.create({
    data: {
      type: accountType,
      legalName,
      slug: `${slugBase}-${randomInt(1000, 9999)}`,
      verificationTier: 0,
      referringAffiliateId,
      assignedRep: "Alex Morgan",
    },
  });
  const user = await prisma.user.create({
    data: {
      orgId: org.id,
      email,
      name,
      roles: JSON.stringify(roles),
      passwordHash: await bcrypt.hash(password, 12),
      mfaHash: await bcrypt.hash(pin, 10),
      mfaEnabled: true,
      lastLoginAt: new Date(),
    },
  });
  if (accountType === "affiliate") {
    const code = legalName.replace(/[^A-Za-z]/g, "").slice(0, 8).toUpperCase() || "PARTNER";
    const affiliateCode = `${code}${randomInt(10, 99)}`;
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://www.thewellnesstech.com").replace(/\/$/, "");
    await prisma.affiliateProfile.create({
      data: {
        userId: user.id,
        code: affiliateCode,
        payoutToken: "tok_bank_sandbox",
        w9Status: "sandbox_received",
        parentId: parentAffiliateProfileId,
        partnerLink: `${appUrl}/signup?ref=${affiliateCode}`,
      },
    });
  }
  await audit({ actorId: user.id, action: "auth.signup", object: org.id, after: accountType });
  await setLogin(user.id);
  if (roles.includes("prescriber")) redirect("/signup/npi");
  redirect("/portal");
}

export async function saveNpi(formData: FormData) {
  const userId = await readUserId();
  if (!userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { org: true } });
  if (!user) redirect("/login");
  const npi = String(formData.get("npi") || "").replace(/\D/g, "");
  const license = String(formData.get("license") || "").trim();
  const attested = formData.get("attest") === "on";
  if (!/^\d{10}$/.test(npi)) redirect("/signup/npi?error=NPI+numbers+are+10+digits");
  if (!attested || license.length < 3) redirect("/signup/npi?error=Confirm+an+active+state+license");

  let displayName = user.name;
  let specialty = "";
  if (npi === "1000000001" && process.env.SANDBOX_AUTH === "true") {
    displayName = `${user.name}, MD`;
    specialty = "Sandbox registry";
  } else {
    const response = await fetch(`https://npiregistry.cms.hhs.gov/api/?version=2.1&number=${npi}`, {
      cache: "no-store",
    });
    const data = (await response.json()) as {
      result_count?: number;
      results?: { basic?: { first_name?: string; last_name?: string; credential?: string }; taxonomies?: { desc?: string }[] }[];
    };
    if (!data.result_count) redirect("/signup/npi?error=That+NPI+was+not+found");
    const basic = data.results?.[0]?.basic;
    displayName = [basic?.first_name, basic?.last_name, basic?.credential].filter(Boolean).join(" ");
    specialty = data.results?.[0]?.taxonomies?.[0]?.desc || "";
  }

  await prisma.prescriberCredential.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      npi,
      displayName,
      specialty,
      licenseCipher: encryptField(license),
      oigStatus: "pending_vendor",
      verificationTier: 1,
    },
    update: {
      npi,
      displayName,
      specialty,
      licenseCipher: encryptField(license),
      verificationTier: 1,
    },
  });
  const nextTier = Math.max(user.org.verificationTier, 1);
  await prisma.organization.update({ where: { id: user.orgId }, data: { verificationTier: nextTier } });
  await audit({
    actorId: user.id,
    action: "credential.npi_verified",
    object: user.orgId,
    after: "tier-1; oig, DEA, and state-board vendors still pending",
  });
  redirect("/portal");
}

export async function addToCart(formData: FormData) {
  const userId = await readUserId();
  if (!userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { org: true } });
  if (!user) redirect("/login");
  const product = await prisma.product.findUnique({ where: { id: String(formData.get("productId") || "") } });
  if (!product || !isProductClass(product.productClass)) redirect("/portal/catalog?error=Unknown+product");
  const gate = canOrder(user.org.verificationTier, product.productClass, product.orderable);
  if (!gate.ok) redirect(`/portal/catalog?error=${encodeURIComponent(gate.reason || "Cannot add")}`);
  const initials = String(formData.get("initials") || "").trim();
  if (product.rxRequired && initials.length < 2) {
    redirect("/portal/catalog?error=Patient-specific+lines+need+initials+only");
  }
  await prisma.cartItem.create({
    data: {
      userId: user.id,
      productId: product.id,
      qty: Math.max(1, Number(formData.get("qty") || 1)),
      patientInitials: initials,
      sig: String(formData.get("sig") || ""),
      daysSupply: Math.max(0, Number(formData.get("daysSupply") || (product.rxRequired ? 30 : 0))),
    },
  });
  redirect("/portal/cart");
}

export async function removeCartItem(formData: FormData) {
  const userId = await readUserId();
  if (!userId) redirect("/login");
  await prisma.cartItem.deleteMany({ where: { id: String(formData.get("id") || ""), userId } });
  redirect("/portal/cart");
}

export async function placeOrder(formData: FormData) {
  const userId = await readUserId();
  if (!userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { org: true, credential: true } });
  if (!user) redirect("/login");

  const shipDestination = String(formData.get("shipDestination") || "PRACTICE").toUpperCase() === "PATIENT" ? "PATIENT" : "PRACTICE";
  const signatureDataUrl = String(formData.get("signatureDataUrl") || "");
  const opaqueToken = String(formData.get("paymentNonce") || formData.get("opaqueDataValue") || "").trim();
  const rawLast4 = String(formData.get("last4") || "");
  const cardField = String(formData.get("card") || "");
  if (rejectCardNumber(rawLast4) || rejectCardNumber(cardField)) {
    return { error: "Send only the last four digits. Full card numbers are refused." };
  }

  const sandboxPay = paymentsSandboxEnabled();
  let paymentToken = "";
  let cardLast4 = "";
  let paymentStatus = "authorized";

  if (sandboxPay) {
    try {
      const payment = tokenizeLast4(rawLast4 || "4242");
      paymentToken = payment.token;
      cardLast4 = payment.last4;
      paymentStatus = "authorized";
    } catch {
      return { error: "Enter the last four digits of the saved card." };
    }
  } else {
    if (!opaqueToken) {
      return { error: "Live payments require a gateway nonce. Set PAYMENTS_MODE=sandbox for demos." };
    }
    paymentToken = `live_${opaqueToken.slice(0, 48)}`;
    cardLast4 = rawLast4.replace(/\D/g, "").slice(-4) || "****";
    paymentStatus = "paid";
  }

  const items = await prisma.cartItem.findMany({ where: { userId: user.id } });
  if (!items.length) return { error: "The cart is empty." };
  const products = await prisma.product.findMany({ where: { id: { in: items.map((item) => item.productId) } } });
  const byId = new Map(products.map((product) => [product.id, product]));
  const hasVerifiedPrescriber = Boolean(user.credential && user.credential.verificationTier >= 1);
  const classes = [];
  let subtotal = 0;
  let needsEscript = false;
  for (const item of items) {
    const product = byId.get(item.productId);
    if (!product || !isProductClass(product.productClass)) return { error: "A cart line is no longer available." };
    const gate = canOrder(user.org.verificationTier, product.productClass, product.orderable, {
      hasVerifiedPrescriber: product.productClass === "503A" || product.productClass === "503B" ? hasVerifiedPrescriber : undefined,
    });
    if (!gate.ok) return { error: gate.reason };
    if (product.rxRequired && item.patientInitials.trim().length < 2) {
      return { error: "Each prescription line needs patient initials." };
    }
    if (requiresEscript(product.productClass, product.rxRequired)) needsEscript = true;
    classes.push(product.productClass);
    subtotal += product.priceCents * item.qty;
  }

  if (needsEscript && !signatureDataUrl.startsWith("data:image")) {
    return { error: "503A/503B lines require a signed eScript before the order can go to pharmacy." };
  }
  if (needsEscript) {
    const { assertCanSignEscript } = await import("@/lib/escript");
    const gate = assertCanSignEscript(user);
    if (!gate.ok) return { error: gate.error };
    if (formData.get("attestationAccepted") !== "1" && formData.get("attestationAccepted") !== "on") {
      return { error: "Confirm the prescribing attestation before signing." };
    }
  }

  const split = fulfillmentGroups(classes);
  const shipping = shippingCents(products.map((product) => product.storage));
  const pharmacies = await ensurePharmacyNetwork();
  const eventide = pharmacies.find((p) => /eventide/i.test(p.name)) || pharmacies[0];
  const clinicalPatientId = items.map((i) => i.clinicalPatientId).find(Boolean) || null;
  const count = await prisma.order.count();
  const order = await prisma.order.create({
    data: {
      orgId: user.orgId,
      placedById: user.id,
      clinicalPatientId: clinicalPatientId || undefined,
      pharmacyId: eventide?.id,
      invoiceNumber: `WT-2026-${String(count + 1).padStart(4, "0")}`,
      status: needsEscript && !signatureDataUrl ? "on_hold" : "submitted",
      paymentStatus,
      paymentToken,
      cardLast4,
      shippingFeeCents: shipping,
      subtotalCents: subtotal,
      totalCents: subtotal + shipping,
      shipDestination,
      escriptStatus: needsEscript ? (signatureDataUrl ? "signed" : "pending_signature") : "not_required",
      source: "portal",
      splitMessage: split.message,
      shipToJson: JSON.stringify({ destination: shipDestination }),
      lines: {
        create: items.map((item) => {
          const product = byId.get(item.productId)!;
          return {
            sku: product.sku,
            name: product.name,
            productClass: product.productClass,
            qty: item.qty,
            unitPriceCents: product.priceCents,
            patientInitials: item.patientInitials,
            prescriber: user.credential?.displayName || user.name,
            sig: item.sig,
            daysSupply: item.daysSupply,
            strength: product.strength,
            size: product.size,
            dosageForm: product.form,
          };
        }),
      },
    },
    include: { lines: true },
  });

  if (needsEscript) {
    const {
      buildLinesSnapshot,
      buildPatientSnapshot,
      buildSignedEscriptPayload,
    } = await import("@/lib/escript");
    const { requestClientMeta } = await import("@/lib/auth-security");
    const meta = await requestClientMeta();
    const patientRow = clinicalPatientId
      ? await prisma.clinicalPatient.findUnique({ where: { id: clinicalPatientId } })
      : null;
    const signed = buildSignedEscriptPayload({
      user,
      orderId: order.id,
      invoiceNumber: order.invoiceNumber,
      clinicalPatientId,
      patient: buildPatientSnapshot(patientRow),
      lines: buildLinesSnapshot(order.lines),
      signatureDataUrl,
      directions: String(formData.get("directions") || "As directed by prescribing clinician."),
      attestationAccepted: true,
      ip: meta.ip,
      ua: meta.ua,
      licenseState: String(formData.get("licenseState") || ""),
    });
    if (!signed.ok) return { error: signed.error };
    await prisma.eScript.create({
      data: {
        orderId: order.id,
        ...signed.data,
        clinicalPatientId: clinicalPatientId || undefined,
      },
    });
    await audit({
      actorId: user.id,
      action: "escript.signed",
      object: order.id,
      after: signed.data.contentHash,
      ip: meta.ip,
    });
  }

  for (const line of order.lines) {
    if (!line.patientInitials) continue;
    const patient = await ensurePatient(user.orgId, line.patientInitials);
    if (patient) {
      await prisma.orderLine.update({ where: { id: line.id }, data: { rxcorePatientId: patient.rxcorePatientId } });
    }
  }
  await prisma.cartItem.deleteMany({ where: { userId: user.id } });

  // Block pharmacy forward until eScript is signed for Rx classes
  if (!needsEscript || signatureDataUrl.startsWith("data:image")) {
    await openRxcoreOrder({
      orderId: order.id,
      lines: order.lines.filter((line) => isProductClass(line.productClass)).map((line) => ({
        productClass: line.productClass as "503A",
        patientInitials: line.patientInitials,
      })),
    });
  }

  // Draft refill reminders from days supply
  for (const line of order.lines) {
    if (!line.daysSupply || line.daysSupply < 7 || !line.patientInitials) continue;
    const due = new Date();
    due.setDate(due.getDate() + Math.max(7, line.daysSupply - 7));
    await prisma.refill.create({
      data: {
        orgId: user.orgId,
        patientInitials: line.patientInitials,
        productName: line.name,
        productSku: line.sku,
        dueAt: due,
        daysSupply: line.daysSupply,
        status: "due",
        autopay: Boolean(paymentToken),
      },
    });
  }

  await audit({ actorId: user.id, action: "order.placed", object: order.invoiceNumber, after: `ship:${shipDestination};escript:${order.escriptStatus}` });
  redirect(`/portal/orders/${order.id}`);
}

export async function advanceOrder(formData: FormData) {
  const userId = await readUserId();
  if (!userId) redirect("/login");
  const order = await prisma.order.findUnique({ where: { id: String(formData.get("orderId") || "") } });
  if (!order) redirect("/portal/orders");
  const type = nextEvent(order.status === "submitted" ? "received" : order.status);
  if (!type) redirect(`/portal/orders/${order.id}`);
  await emitOrderEvent(order.id, type);
  redirect(`/portal/orders/${order.id}`);
}

export async function approveRefill(formData: FormData) {
  const userId = await readUserId();
  if (!userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { org: true, credential: true } });
  if (!user || !rolesOf(user.roles).some((role) => role === "prescriber" || role === "owner")) {
    redirect("/portal/refills?error=A+prescriber+has+to+approve+refills");
  }
  const ids = formData.getAll("refillId").map(String);
  const refills = await prisma.refill.findMany({ where: { id: { in: ids }, orgId: user.orgId, status: "due" } });
  if (!refills.length) redirect("/portal/refills?error=Nothing+is+waiting");
  let sequence = await prisma.order.count();
  for (const refill of refills) {
    const product = await prisma.product.findUnique({ where: { sku: refill.productSku } });
    if (!product) continue;
    sequence += 1;
    const shipping = shippingCents([product.storage]);
    const needsEscript = requiresEscript(product.productClass, product.rxRequired);
    const order = await prisma.order.create({
      data: {
        orgId: user.orgId,
        placedById: user.id,
        invoiceNumber: `WT-2026-${String(sequence).padStart(4, "0")}`,
        status: needsEscript ? "on_hold" : "submitted",
        paymentStatus: refill.autopay ? "authorized" : "unpaid",
        paymentToken: refill.autopay ? "tok_sandbox_autopay" : "",
        cardLast4: refill.autopay ? "4242" : "",
        shippingFeeCents: shipping,
        subtotalCents: product.priceCents,
        totalCents: product.priceCents + shipping,
        source: "refill",
        escriptStatus: needsEscript ? "pending_signature" : "not_required",
        lines: {
          create: {
            sku: product.sku,
            name: product.name,
            productClass: product.productClass,
            qty: 1,
            unitPriceCents: product.priceCents,
            patientInitials: refill.patientInitials,
            prescriber: user.credential?.displayName || user.name,
            daysSupply: refill.daysSupply,
            strength: product.strength,
            size: product.size,
            dosageForm: product.form,
          },
        },
      },
      include: { lines: true },
    });
    if (needsEscript) {
      await prisma.eScript.create({
        data: {
          orderId: order.id,
          status: "draft",
          npi: user.credential?.npi || "",
          displayName: user.credential?.displayName || user.name,
          directions: "Continue previous therapy as directed.",
          linesSnapshotJson: JSON.stringify(
            order.lines.map((line) => ({
              sku: line.sku,
              name: line.name,
              productClass: line.productClass,
              qty: line.qty,
              unitPriceCents: line.unitPriceCents,
              strength: line.strength,
              size: line.size,
              dosageForm: line.dosageForm,
              sig: line.sig,
              daysSupply: line.daysSupply,
              patientInitials: line.patientInitials,
            })),
          ),
        },
      });
    }
    await prisma.refill.update({ where: { id: refill.id }, data: { status: needsEscript ? "awaiting_escript" : "approved" } });
    if (!needsEscript) {
      await openRxcoreOrder({
        orderId: order.id,
        lines: [{ productClass: "503A", patientInitials: refill.patientInitials }],
      });
    } else {
      // First refill needing a signature — send clinician to the order signing desk.
      redirect(`/portal/orders/${order.id}?refill=sign`);
    }
  }
  redirect("/portal/refills");
}

export async function syncRxHereFormularyAction() {
  const userId = await readUserId();
  if (!userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !rolesOf(user.roles).includes("admin")) redirect("/login");
  const { syncRxHereFormulary } = await import("@/lib/formulary-sync");
  const result = await syncRxHereFormulary(user.id);
  if (!result.ok) redirect(`/admin/products?error=${encodeURIComponent(result.error)}`);
  redirect(`/admin/products?synced=${result.upserted}&source=${result.source}`);
}

export async function saveProduct(formData: FormData) {
  const userId = await readUserId();
  if (!userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !rolesOf(user.roles).includes("admin")) redirect("/login");
  const id = String(formData.get("id") || "");
  const before = await prisma.product.findUnique({ where: { id } });
  if (!before) redirect("/admin/products");
  const price = Math.round(Number(formData.get("price") || 0) * 100);
  if (!Number.isFinite(price) || price < 0) redirect(`/admin/products/${id}?error=Enter+a+price`);
  const updated = await prisma.product.update({
    where: { id },
    data: {
      name: String(formData.get("name") || before.name),
      description: String(formData.get("description") || ""),
      priceCents: price,
      active: formData.get("active") === "on",
      orderable: formData.get("orderable") === "on",
      holdReason: String(formData.get("holdReason") || ""),
    },
  });
  await audit({
    actorId: user.id,
    action: "catalog.updated",
    object: updated.sku,
    before: `${before.name} ${before.priceCents}`,
    after: `${updated.name} ${updated.priceCents}`,
  });
  redirect("/admin/products");
}

export async function sendRepMessage(formData: FormData) {
  const userId = await readUserId();
  if (!userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) redirect("/login");
  const body = String(formData.get("body") || "").trim();
  if (body.length < 2) redirect("/portal/messages?error=Write+a+message");
  await prisma.message.create({ data: { orgId: user.orgId, authorName: user.name, body } });
  redirect("/portal/messages");
}

export async function logout() {
  await clearLogin();
  redirect("/");
}

export async function placeSandboxApiOrder() {
  const userId = await readUserId();
  if (!userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !rolesOf(user.roles).includes("admin")) redirect("/login");
  const key = await prisma.apiKey.findUnique({ where: { keyHash: hashKey("wt_sandbox_demo_key") } });
  const placer = key ? await prisma.user.findFirst({ where: { orgId: key.orgId } }) : null;
  if (!key || !placer) redirect("/developers?error=Sandbox+API+key+is+not+seeded");
  const created = await createExternalOrder({
    orgId: key.orgId,
    userId: placer.id,
    sku: "SUP-SYRINGE-10",
    qty: 1,
    source: "api",
  });
  if ("error" in created) redirect(`/developers?error=${encodeURIComponent(created.error || "Sandbox order failed")}`);
  await emitOrderEvent(created.orderId, "order.verified");
  await emitOrderEvent(created.orderId, "order.shipped");
  redirect("/developers");
}

export async function createSandboxKey(formData: FormData) {
  const userId = await readUserId();
  if (!userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !rolesOf(user.roles).includes("admin")) redirect("/login");
  const label = String(formData.get("label") || "Sandbox key").slice(0, 40);
  const secret = `wt_sandbox_${randomInt(100000, 999999)}`;
  await prisma.apiKey.create({
    data: { orgId: user.orgId, label, keyHash: hashKey(secret), prefix: secret.slice(0, 14), sandbox: true },
  });
  redirect(`/developers?created=${encodeURIComponent(secret)}`);
}

export async function adminUpdatePractice(formData: FormData) {
  const userId = await readUserId();
  if (!userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !rolesOf(user.roles).includes("admin")) redirect("/login");
  const id = String(formData.get("id") || "");
  const org = await prisma.organization.findUnique({ where: { id } });
  if (!org) redirect("/admin/practices");
  const tier = Math.max(0, Math.min(3, Number(formData.get("verificationTier") || org.verificationTier)));
  const status = String(formData.get("status") || org.status || "active").slice(0, 40);
  const assignedRep = String(formData.get("assignedRep") || org.assignedRep || "").slice(0, 80);
  const updated = await prisma.organization.update({
    where: { id },
    data: {
      verificationTier: Number.isFinite(tier) ? tier : org.verificationTier,
      status,
      assignedRep,
      legalName: String(formData.get("legalName") || org.legalName).slice(0, 160),
    },
  });
  await audit({
    actorId: user.id,
    action: "admin.practice_updated",
    object: updated.id,
    before: `tier ${org.verificationTier} ${org.status}`,
    after: `tier ${updated.verificationTier} ${updated.status}`,
  });
  redirect(`/admin/practices/${id}`);
}

export async function adminAdvanceOrder(formData: FormData) {
  const userId = await readUserId();
  if (!userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !rolesOf(user.roles).includes("admin")) redirect("/login");
  const orderId = String(formData.get("orderId") || "");
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) redirect("/admin/orders");
  const next = nextEvent(order.status);
  if (!next) redirect(`/admin/orders/${orderId}`);
  await emitOrderEvent(order.id, next);
  await prisma.order.update({ where: { id: order.id }, data: { status: next } });
  await audit({ actorId: user.id, action: "admin.order_advanced", object: order.id, after: next });
  redirect(`/admin/orders/${orderId}`);
}
