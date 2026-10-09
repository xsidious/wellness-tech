"use server";

import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { encryptField, hashKey, rejectCardNumber, tokenizeLast4 } from "@/lib/crypto";
import { clearLogin, readPending, readUserId, setLogin, setPending } from "@/lib/session";
import { canOrder, fulfillmentGroups, isProductClass, shippingCents } from "@/lib/rules";
import { createExternalOrder, emitOrderEvent, ensurePatient, nextEvent, openRxcoreOrder } from "@/lib/rxcore";
import { rolesOf } from "@/lib/guard";
import { honeypotTripped, rateLimit, verifyTurnstile } from "@/lib/anti-bot";

function sandboxCode(code: string) {
  return process.env.SANDBOX_AUTH === "false" ? "" : code;
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

/** One-step staff admin login (email + password) — clearer than magic code + PIN. */
export async function adminPasswordLogin(formData: FormData) {
  try {
    if (honeypotTripped(formData)) return { error: "Unable to sign in." };
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");
    const turnstile = String(formData.get("cf-turnstile-response") || "");
    if (!email.includes("@") || password.length < 8) return { error: "Enter admin email and password." };

    const limited = rateLimit(`wt-admin-login:${email}`, 8, 10 * 60 * 1000);
    if (!limited.ok) return { error: "Too many attempts. Wait a few minutes." };

    const bot = await verifyTurnstile(turnstile);
    if (!bot.ok) return { error: bot.error || "Bot check failed." };

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash || !rolesOf(user.roles).includes("admin")) {
      return { error: "Invalid admin credentials." };
    }
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      return { error: "Invalid admin credentials." };
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit({ actorId: user.id, action: "auth.admin_password_login", object: user.email });
    await setLogin(user.id);
    const next = String(formData.get("next") || "");
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
    redirect(safeNext.startsWith("/admin") ? safeNext : "/admin");
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
  try {
    const email = await readPending();
    const pin = String(formData.get("pin") || "").trim();
    if (!email) return { error: "Start again from the email code." };
    if (!/^\d{6}$/.test(pin)) return { error: "The second factor is 6 digits." };
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.mfaHash) return { error: "Set up the second factor first." };
    if (!(await bcrypt.compare(pin, user.mfaHash))) return { error: "That PIN does not match." };
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit({ actorId: user.id, action: "auth.login", object: user.email });
    await setLogin(user.id);
    const next = String(formData.get("next") || "");
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "";
    redirect(safeNext || (rolesOf(user.roles).includes("admin") ? "/admin" : "/portal"));
  } catch (error) {
    return { error: signInError(error) };
  }
}

export async function completeSignup(formData: FormData) {
  const email = await readPending();
  if (!email) return { error: "Verify the email code first." };
  const name = String(formData.get("name") || "").trim();
  const legalName = String(formData.get("legalName") || "").trim();
  const accountType = String(formData.get("accountType") || "practice");
  const pin = String(formData.get("pin") || "").trim();
  const ref = String(formData.get("ref") || "").trim().toUpperCase();
  if (name.length < 2 || legalName.length < 2) return { error: "Name and organization are required." };
  if (!/^\d{6}$/.test(pin)) return { error: "Choose a 6-digit second factor." };
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "That email already has an account. Sign in instead." };

  let referringAffiliateId = "";
  if (ref) {
    const affiliate = await prisma.affiliateProfile.findUnique({ where: { code: ref } });
    if (affiliate) referringAffiliateId = affiliate.userId;
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
      mfaHash: await bcrypt.hash(pin, 8),
      mfaEnabled: true,
      lastLoginAt: new Date(),
    },
  });
  if (accountType === "affiliate") {
    const code = legalName.replace(/[^A-Za-z]/g, "").slice(0, 8).toUpperCase() || "PARTNER";
    await prisma.affiliateProfile.create({
      data: {
        userId: user.id,
        code: `${code}${randomInt(10, 99)}`,
        payoutToken: "tok_bank_sandbox",
        w9Status: "sandbox_received",
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
  const rawLast4 = String(formData.get("last4") || "");
  const cardField = String(formData.get("card") || "");
  if (rejectCardNumber(rawLast4) || rejectCardNumber(cardField)) {
    return { error: "Send only the last four digits. Full card numbers are refused." };
  }
  let payment;
  try {
    payment = tokenizeLast4(rawLast4);
  } catch {
    return { error: "Enter the last four digits of the saved card." };
  }
  const items = await prisma.cartItem.findMany({ where: { userId: user.id } });
  if (!items.length) return { error: "The cart is empty." };
  const products = await prisma.product.findMany({ where: { id: { in: items.map((item) => item.productId) } } });
  const byId = new Map(products.map((product) => [product.id, product]));
  const classes = [];
  let subtotal = 0;
  for (const item of items) {
    const product = byId.get(item.productId);
    if (!product || !isProductClass(product.productClass)) return { error: "A cart line is no longer available." };
    const gate = canOrder(user.org.verificationTier, product.productClass, product.orderable);
    if (!gate.ok) return { error: gate.reason };
    if (product.rxRequired && item.patientInitials.trim().length < 2) {
      return { error: "Each prescription line needs patient initials." };
    }
    classes.push(product.productClass);
    subtotal += product.priceCents * item.qty;
  }
  const split = fulfillmentGroups(classes);
  const shipping = shippingCents(products.map((product) => product.storage));
  const count = await prisma.order.count();
  const order = await prisma.order.create({
    data: {
      orgId: user.orgId,
      placedById: user.id,
      invoiceNumber: `WT-2026-${String(count + 1).padStart(4, "0")}`,
      status: "submitted",
      paymentStatus: "authorized",
      paymentToken: payment.token,
      cardLast4: payment.last4,
      shippingFeeCents: shipping,
      subtotalCents: subtotal,
      totalCents: subtotal + shipping,
      source: "portal",
      splitMessage: split.message,
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
          };
        }),
      },
    },
    include: { lines: true },
  });
  for (const line of order.lines) {
    if (!line.patientInitials) continue;
    const patient = await ensurePatient(user.orgId, line.patientInitials);
    if (patient) {
      await prisma.orderLine.update({ where: { id: line.id }, data: { rxcorePatientId: patient.rxcorePatientId } });
    }
  }
  await prisma.cartItem.deleteMany({ where: { userId: user.id } });
  await openRxcoreOrder({
    orderId: order.id,
    lines: order.lines.filter((line) => isProductClass(line.productClass)).map((line) => ({
      productClass: line.productClass as "503A",
      patientInitials: line.patientInitials,
    })),
  });
  await audit({ actorId: user.id, action: "order.placed", object: order.invoiceNumber });
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
    const order = await prisma.order.create({
      data: {
        orgId: user.orgId,
        placedById: user.id,
        invoiceNumber: `WT-2026-${String(sequence).padStart(4, "0")}`,
        status: "submitted",
        paymentStatus: refill.autopay ? "authorized" : "unpaid",
        paymentToken: refill.autopay ? "tok_sandbox_autopay" : "",
        cardLast4: refill.autopay ? "4242" : "",
        shippingFeeCents: shipping,
        subtotalCents: product.priceCents,
        totalCents: product.priceCents + shipping,
        source: "refill",
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
          },
        },
      },
    });
    await prisma.refill.update({ where: { id: refill.id }, data: { status: "approved" } });
    await openRxcoreOrder({
      orderId: order.id,
      lines: [{ productClass: "503A", patientInitials: refill.patientInitials }],
    });
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
