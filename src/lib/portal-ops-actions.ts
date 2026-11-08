"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { audit } from "@/lib/audit";
import { sendTransactionalEmail } from "@/lib/email";
import { requireUser, rolesOf } from "@/lib/guard";
import { notifyOrg } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://www.wellnesstechdistribution.com").replace(/\/$/, "");
}

function assertPracticeClinical(roles: string[]) {
  if (!roles.some((r) => ["owner", "prescriber", "staff", "admin"].includes(r))) {
    throw new Error("Not allowed");
  }
}

function assertOwner(roles: string[]) {
  if (!roles.some((r) => ["owner", "admin"].includes(r))) throw new Error("Owner only");
}

export async function claimInvitePassword(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const pin = String(formData.get("pin") || "").trim();
  if (!email.includes("@") || password.length < 10) {
    redirect("/claim-account?error=Password+must+be+10%2B+characters");
  }
  if (!/^\d{6}$/.test(pin)) redirect("/claim-account?error=PIN+must+be+6+digits");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) redirect("/claim-account?error=No+invite+found+for+that+email");
  if (user.passwordHash) redirect("/login?notice=already");

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(password, 12),
      mfaHash: await bcrypt.hash(pin, 12),
      mfaEnabled: true,
    },
  });
  await audit({ actorId: user.id, action: "auth.claim_password", object: user.id });
  redirect("/login?claimed=1");
}

export async function inviteTeamMember(formData: FormData) {
  const user = await requireUser();
  const roles = rolesOf(user.roles);
  assertOwner(roles);

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name = String(formData.get("name") || "").trim();
  const role = String(formData.get("role") || "staff");
  if (!email.includes("@") || !name) throw new Error("Name and email required");
  if (!["staff", "billing", "prescriber", "owner"].includes(role)) throw new Error("Invalid role");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.orgId !== user.orgId) throw new Error("Email already used by another org");

  let inviteeId = existing?.id;
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name,
        roles: JSON.stringify(Array.from(new Set([...rolesOf(existing.roles), role]))),
      },
    });
  } else {
    const created = await prisma.user.create({
      data: {
        orgId: user.orgId,
        email,
        name,
        roles: JSON.stringify([role]),
        passwordHash: "",
      },
    });
    inviteeId = created.id;
  }

  const npi = String(formData.get("npi") || "").trim();
  if (role === "prescriber" && npi && inviteeId) {
    const foundCred = await prisma.prescriberCredential.findUnique({ where: { userId: inviteeId } });
    if (!foundCred) {
      await prisma.prescriberCredential.create({
        data: {
          userId: inviteeId,
          npi,
          displayName: name,
          specialty: String(formData.get("specialty") || ""),
          licensesJson: JSON.stringify(
            String(formData.get("licenseState") || "")
              ? [{ state: String(formData.get("licenseState")), licenseNumber: String(formData.get("licenseNumber") || "") }]
              : [],
          ),
          deaCipher: String(formData.get("dea") || ""),
        },
      });
    }
  }

  try {
    await sendTransactionalEmail({
      to: email,
      subject: `${user.org.legalName} invited you to Wellness Tech`,
      text: [
        `Hi ${name},`,
        "",
        `${user.name} invited you as ${role} for ${user.org.legalName}.`,
        "",
        `Claim your account: ${appUrl()}/claim-account?email=${encodeURIComponent(email)}`,
        `Or request a magic login code at: ${appUrl()}/login`,
      ].join("\n"),
      html: `<p>Hi ${name},</p><p><strong>${user.name}</strong> invited you as <strong>${role}</strong> for <strong>${user.org.legalName}</strong>.</p><p><a href="${appUrl()}/claim-account?email=${encodeURIComponent(email)}">Claim your account</a></p>`,
    });
  } catch (error) {
    console.error("team invite email failed", error);
  }

  await notifyOrg({
    orgId: user.orgId,
    kind: "team.invite",
    title: `Invited ${name} as ${role}`,
    href: "/portal/team",
  });

  revalidatePath("/portal/team");
  revalidatePath("/portal/practitioners");
  redirect("/portal/team?invited=1");
}

export async function ensureClinicCode() {
  const user = await requireUser();
  if (user.org.clinicCode) return user.org.clinicCode;
  const code = user.org.slug.slice(0, 10) || user.orgId.slice(0, 10);
  await prisma.organization.update({ where: { id: user.orgId }, data: { clinicCode: code } });
  return code;
}

export async function importPatientsCsv(formData: FormData) {
  const user = await requireUser();
  assertPracticeClinical(rolesOf(user.roles));
  const raw = String(formData.get("csv") || "");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let created = 0;
  for (const line of lines.slice(0, 200)) {
    if (/^fullName|^name,/i.test(line)) continue;
    const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    const [fullName, email, phone, dateOfBirth] = parts;
    if (!fullName || !email?.includes("@")) continue;
    const exists = await prisma.clinicalPatient.findFirst({
      where: { orgId: user.orgId, email: email.toLowerCase() },
    });
    if (exists) continue;
    await prisma.clinicalPatient.create({
      data: {
        orgId: user.orgId,
        fullName,
        email: email.toLowerCase(),
        phone: phone || "",
        dateOfBirth: dateOfBirth || "",
        sourceSite: "csv-import",
        intakeStatus: "imported",
      },
    });
    created += 1;
  }
  revalidatePath("/portal/patients");
  redirect(`/portal/patients?imported=${created}`);
}

export async function toggleRxFavorite(formData: FormData) {
  const user = await requireUser();
  const sku = String(formData.get("sku") || "");
  const name = String(formData.get("name") || sku);
  if (!sku) redirect("/portal/catalog");
  const existing = await prisma.rxFavorite.findUnique({
    where: { orgId_sku: { orgId: user.orgId, sku } },
  });
  if (existing) {
    await prisma.rxFavorite.delete({ where: { id: existing.id } });
  } else {
    await prisma.rxFavorite.create({
      data: { orgId: user.orgId, userId: user.id, sku, name },
    });
  }
  revalidatePath("/portal/catalog");
  revalidatePath("/portal/patients");
  redirect(String(formData.get("next") || "/portal/catalog"));
}

export async function submitCompoundRequest(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Compound name required");
  await prisma.compoundRequest.create({
    data: {
      orgId: user.orgId,
      requestedBy: user.id,
      name,
      strength: String(formData.get("strength") || ""),
      form: String(formData.get("form") || ""),
      note: String(formData.get("note") || ""),
    },
  });
  await notifyOrg({
    orgId: user.orgId,
    kind: "compound.request",
    title: `Compound request: ${name}`,
    href: "/portal/catalog?tab=requests",
  });
  revalidatePath("/portal/catalog");
  redirect("/portal/catalog?requested=1");
}

export async function createPrescribeRequest(formData: FormData) {
  const user = await requireUser();
  assertPracticeClinical(rolesOf(user.roles));
  const patientName = String(formData.get("patientName") || "").trim();
  const productName = String(formData.get("productName") || "").trim();
  if (!patientName || !productName) throw new Error("Patient and product required");
  await prisma.prescribeRequest.create({
    data: {
      orgId: user.orgId,
      clinicalPatientId: String(formData.get("clinicalPatientId") || ""),
      patientName,
      productName,
      productSku: String(formData.get("productSku") || ""),
      note: String(formData.get("note") || ""),
    },
  });
  await notifyOrg({
    orgId: user.orgId,
    kind: "script.request",
    title: `Script request for ${patientName}`,
    href: "/portal/script-requests",
  });
  revalidatePath("/portal/script-requests");
  redirect("/portal/script-requests?created=1");
}

export async function markNotificationsRead() {
  const user = await requireUser();
  await prisma.appNotification.updateMany({
    where: {
      orgId: user.orgId,
      readAt: null,
      OR: [{ userId: "" }, { userId: user.id }],
    },
    data: { readAt: new Date() },
  });
  revalidatePath("/portal");
  revalidatePath("/portal/notifications");
  redirect("/portal/notifications");
}

export async function savePracticeProfile(formData: FormData) {
  const user = await requireUser();
  assertOwner(rolesOf(user.roles));
  await prisma.organization.update({
    where: { id: user.orgId },
    data: {
      legalName: String(formData.get("legalName") || user.org.legalName).slice(0, 160),
      specialty: String(formData.get("specialty") || "").slice(0, 120),
      website: String(formData.get("website") || "").slice(0, 200),
      phone: String(formData.get("phone") || "").slice(0, 40),
      hidePricingFromStaff: formData.get("hidePricingFromStaff") === "on",
    },
  });
  revalidatePath("/portal/settings");
  redirect("/portal/settings?saved=1&tab=profile");
}

export async function saveBranding(formData: FormData) {
  const user = await requireUser();
  assertOwner(rolesOf(user.roles));
  const branding = {
    active: formData.get("active") === "on",
    displayName: String(formData.get("displayName") || user.org.legalName).slice(0, 80),
    tagline: String(formData.get("tagline") || "").slice(0, 160),
    primary: String(formData.get("primary") || "#184868"),
    secondary: String(formData.get("secondary") || "#245a78"),
    accent: String(formData.get("accent") || "#c4a574"),
    supportEmail: String(formData.get("supportEmail") || "").slice(0, 120),
    supportPhone: String(formData.get("supportPhone") || "").slice(0, 40),
  };
  await prisma.organization.update({
    where: { id: user.orgId },
    data: { brandingJson: JSON.stringify(branding) },
  });
  revalidatePath("/portal/settings");
  redirect("/portal/settings?saved=1&tab=branding");
}

export async function saveNotificationPrefs(formData: FormData) {
  const user = await requireUser();
  const prefs = {
    orderUpdatesInApp: formData.get("orderUpdatesInApp") === "on",
    orderUpdatesEmail: formData.get("orderUpdatesEmail") === "on",
    refillRemindersInApp: formData.get("refillRemindersInApp") === "on",
    refillRemindersEmail: formData.get("refillRemindersEmail") === "on",
    patientNotifyEmail: formData.get("patientNotifyEmail") === "on",
    patientNotifyPortal: formData.get("patientNotifyPortal") === "on",
  };
  await prisma.organization.update({
    where: { id: user.orgId },
    data: { notificationPrefsJson: JSON.stringify(prefs) },
  });
  revalidatePath("/portal/settings");
  redirect("/portal/settings?saved=1&tab=account");
}

export async function addPracticeLocation(formData: FormData) {
  const user = await requireUser();
  assertOwner(rolesOf(user.roles));
  const makeDefault = formData.get("isDefault") === "on";
  if (makeDefault) {
    await prisma.practiceLocation.updateMany({
      where: { orgId: user.orgId },
      data: { isDefault: false },
    });
  }
  await prisma.practiceLocation.create({
    data: {
      orgId: user.orgId,
      label: String(formData.get("label") || "Location").slice(0, 80),
      street1: String(formData.get("street1") || ""),
      street2: String(formData.get("street2") || ""),
      city: String(formData.get("city") || ""),
      state: String(formData.get("state") || ""),
      zip: String(formData.get("zip") || ""),
      phone: String(formData.get("phone") || ""),
      isDefault: makeDefault,
    },
  });
  revalidatePath("/portal/settings");
  redirect("/portal/settings?saved=1&tab=profile");
}

export async function createPracticeForm(formData: FormData) {
  const user = await requireUser();
  assertPracticeClinical(rolesOf(user.roles));
  const title = String(formData.get("title") || "").trim() || "Intake form";
  const kind = String(formData.get("kind") || "intake");
  await prisma.practiceForm.create({
    data: {
      orgId: user.orgId,
      title,
      kind,
      schemaJson: JSON.stringify([
        { id: "fullName", label: "Full name", type: "text", required: true },
        { id: "dob", label: "Date of birth", type: "date", required: true },
        { id: "allergies", label: "Allergies", type: "textarea", required: false },
        { id: "consent", label: "I consent to treatment", type: "checkbox", required: true },
      ]),
    },
  });
  revalidatePath("/portal/forms");
  redirect("/portal/forms?created=1");
}

export async function scheduleTelehealthVisit(formData: FormData) {
  const user = await requireUser();
  assertPracticeClinical(rolesOf(user.roles));
  const startsAt = new Date(String(formData.get("startsAt") || ""));
  if (Number.isNaN(startsAt.getTime())) throw new Error("Valid start time required");
  await prisma.telehealthVisit.create({
    data: {
      orgId: user.orgId,
      providerUserId: user.id,
      clinicalPatientId: String(formData.get("clinicalPatientId") || ""),
      patientName: String(formData.get("patientName") || "Patient"),
      startsAt,
      durationMin: Number(formData.get("durationMin") || 30) || 30,
      notes: String(formData.get("notes") || ""),
      meetingUrl: String(formData.get("meetingUrl") || ""),
      status: "scheduled",
    },
  });
  revalidatePath("/portal/telehealth");
  redirect("/portal/telehealth?scheduled=1");
}

export async function createPatientInvoice(formData: FormData) {
  const user = await requireUser();
  const roles = rolesOf(user.roles);
  if (!roles.some((r) => ["owner", "billing", "staff", "admin"].includes(r))) throw new Error("Not allowed");
  const amount = Math.round(Number(formData.get("amount") || 0) * 100);
  if (amount <= 0) throw new Error("Amount required");
  const invoiceNumber = `PI-${Date.now().toString(36).toUpperCase()}`;
  const invoice = await prisma.patientInvoice.create({
    data: {
      orgId: user.orgId,
      clinicalPatientId: String(formData.get("clinicalPatientId") || ""),
      patientName: String(formData.get("patientName") || "Patient"),
      patientEmail: String(formData.get("patientEmail") || "").toLowerCase(),
      invoiceNumber,
      description: String(formData.get("description") || "Visit / services"),
      amountCents: amount,
    },
  });
  if (invoice.patientEmail.includes("@")) {
    try {
      await sendTransactionalEmail({
        to: invoice.patientEmail,
        subject: `Invoice ${invoice.invoiceNumber} from ${user.org.legalName}`,
        text: `Pay your invoice: ${appUrl()}/pay/patient/${invoice.payToken}`,
        html: `<p>Invoice <strong>${invoice.invoiceNumber}</strong> for $${(amount / 100).toFixed(2)}.</p><p><a href="${appUrl()}/pay/patient/${invoice.payToken}">Pay securely</a></p>`,
      });
    } catch (error) {
      console.error("patient invoice email failed", error);
    }
  }
  revalidatePath("/portal/patient-invoices");
  redirect("/portal/patient-invoices?created=1");
}

export async function markPatientInvoicePaid(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") || "");
  await prisma.patientInvoice.updateMany({
    where: { id, orgId: user.orgId },
    data: { status: "paid", paidAt: new Date() },
  });
  revalidatePath("/portal/patient-invoices");
  redirect("/portal/patient-invoices");
}

export async function addPaymentMethod(formData: FormData) {
  const user = await requireUser();
  assertOwner(rolesOf(user.roles));
  const last4 = String(formData.get("last4") || "").replace(/\D/g, "").slice(-4);
  if (last4.length !== 4) throw new Error("Enter last 4 digits");
  await prisma.paymentMethod.create({
    data: {
      orgId: user.orgId,
      brand: String(formData.get("brand") || "card"),
      last4,
      expMonth: Number(formData.get("expMonth") || 1) || 1,
      expYear: Number(formData.get("expYear") || new Date().getFullYear() + 1),
      label: String(formData.get("label") || ""),
      isDefault: formData.get("isDefault") === "on",
    },
  });
  revalidatePath("/portal/settings");
  redirect("/portal/settings?saved=1&tab=billing");
}

export async function sendSupportMessage(formData: FormData) {
  const user = await requireUser();
  const body = String(formData.get("body") || "").trim();
  if (body.length < 2) redirect("/portal/support?error=Write+a+message");
  await prisma.message.create({
    data: {
      orgId: user.orgId,
      authorName: user.name,
      authorUserId: user.id,
      body,
      channel: "rep",
      readAt: new Date(),
    },
  });
  await notifyOrg({
    orgId: user.orgId,
    kind: "support",
    title: "Support message sent",
    body: body.slice(0, 120),
    href: "/portal/support",
  });
  revalidatePath("/portal/support");
  redirect("/portal/support?sent=1");
}
