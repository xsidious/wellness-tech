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
    customDomain: String(formData.get("customDomain") || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .slice(0, 120),
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

export async function updatePracticeForm(formData: FormData) {
  const user = await requireUser();
  assertPracticeClinical(rolesOf(user.roles));
  const id = String(formData.get("id") || "");
  const form = await prisma.practiceForm.findFirst({ where: { id, orgId: user.orgId } });
  if (!form) throw new Error("Form not found");

  const titles = formData.getAll("fieldTitle").map(String);
  const types = formData.getAll("fieldType").map(String);
  const requireds = formData.getAll("fieldRequired").map(String);
  const schema = titles
    .map((title, i) => ({
      id: `f${i + 1}`,
      label: title.trim() || `Question ${i + 1}`,
      type: types[i] || "text",
      required: requireds[i] === "1",
    }))
    .filter((f) => f.label);

  await prisma.practiceForm.update({
    where: { id },
    data: {
      title: String(formData.get("title") || form.title).slice(0, 160),
      kind: String(formData.get("kind") || form.kind),
      active: formData.get("active") === "on",
      schemaJson: JSON.stringify(schema.length ? schema : JSON.parse(form.schemaJson || "[]")),
    },
  });
  revalidatePath("/portal/forms");
  revalidatePath(`/portal/forms/${id}`);
  redirect(`/portal/forms/${id}?saved=1`);
}

export async function submitPublicForm(formData: FormData) {
  const formId = String(formData.get("formId") || "");
  const form = await prisma.practiceForm.findFirst({
    where: { id: formId, active: true },
    include: { org: true },
  });
  if (!form) throw new Error("Form not found");
  const schema = JSON.parse(form.schemaJson || "[]") as { id: string; label: string }[];
  const answers: Record<string, string> = {};
  for (const field of schema) {
    answers[field.id] = String(formData.get(field.id) || "");
  }
  await prisma.formSubmission.create({
    data: {
      formId: form.id,
      clinicalPatientId: String(formData.get("clinicalPatientId") || ""),
      answersJson: JSON.stringify(answers),
      status: "submitted",
    },
  });
  await notifyOrg({
    orgId: form.orgId,
    kind: "form.submitted",
    title: `${form.title} submitted`,
    body: String(answers.f1 || answers.fullName || "New submission"),
    href: `/portal/forms/${form.id}`,
  });
  redirect(`/f/${form.id}?thanks=1`);
}

export async function blockTelehealthTime(formData: FormData) {
  const user = await requireUser();
  assertPracticeClinical(rolesOf(user.roles));
  const startsAt = new Date(String(formData.get("startsAt") || ""));
  if (Number.isNaN(startsAt.getTime())) throw new Error("Valid start required");
  await prisma.telehealthVisit.create({
    data: {
      orgId: user.orgId,
      providerUserId: user.id,
      patientName: "Blocked",
      kind: "blocked",
      startsAt,
      durationMin: Number(formData.get("durationMin") || 60) || 60,
      status: "blocked",
      notes: String(formData.get("notes") || "Blocked time"),
    },
  });
  revalidatePath("/portal/telehealth");
  redirect("/portal/telehealth?blocked=1");
}

export async function startInstantVisit(formData: FormData) {
  const user = await requireUser();
  assertPracticeClinical(rolesOf(user.roles));
  const startsAt = new Date();
  const meetingUrl = String(formData.get("meetingUrl") || "").trim() || `https://meet.jit.si/wt-${user.orgId.slice(0, 8)}-${Date.now().toString(36)}`;
  const visit = await prisma.telehealthVisit.create({
    data: {
      orgId: user.orgId,
      providerUserId: user.id,
      patientName: String(formData.get("patientName") || "Walk-in"),
      clinicalPatientId: String(formData.get("clinicalPatientId") || ""),
      kind: "instant",
      startsAt,
      durationMin: 30,
      status: "in_progress",
      meetingUrl,
      notes: String(formData.get("notes") || ""),
    },
  });
  revalidatePath("/portal/telehealth");
  redirect(`/portal/telehealth?instant=${visit.id}`);
}

export async function saveWorkingHours(formData: FormData) {
  const user = await requireUser();
  assertOwner(rolesOf(user.roles));
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const hours: Record<string, { open: string; close: string; enabled: boolean }> = {};
  for (const day of days) {
    hours[day] = {
      enabled: formData.get(`${day}_enabled`) === "on",
      open: String(formData.get(`${day}_open`) || "09:00"),
      close: String(formData.get(`${day}_close`) || "17:00"),
    };
  }
  await prisma.organization.update({
    where: { id: user.orgId },
    data: {
      workingHoursJson: JSON.stringify({
        hours,
        visitLengthMin: Number(formData.get("visitLengthMin") || 30) || 30,
        bookAheadDays: Number(formData.get("bookAheadDays") || 30) || 30,
      }),
    },
  });
  revalidatePath("/portal/telehealth");
  redirect("/portal/telehealth?hours=1");
}

export async function saveTwilioSettings(formData: FormData) {
  const user = await requireUser();
  assertOwner(rolesOf(user.roles));
  await prisma.organization.update({
    where: { id: user.orgId },
    data: {
      twilioAccountSid: String(formData.get("twilioAccountSid") || "").trim(),
      twilioAuthToken: String(formData.get("twilioAuthToken") || "").trim(),
      twilioPhone: String(formData.get("twilioPhone") || "").trim(),
      twilioEnabled: formData.get("twilioEnabled") === "on",
    },
  });
  revalidatePath("/portal/settings");
  redirect("/portal/settings?saved=1&tab=texts");
}

export async function sendPracticeSms(formData: FormData) {
  const user = await requireUser();
  assertPracticeClinical(rolesOf(user.roles));
  const toPhone = String(formData.get("toPhone") || "").trim();
  const body = String(formData.get("body") || "").trim();
  if (!toPhone || body.length < 1) throw new Error("Phone and message required");

  const org = await prisma.organization.findUnique({ where: { id: user.orgId } });
  let status = "logged";
  if (org?.twilioEnabled && org.twilioAccountSid && org.twilioAuthToken && org.twilioPhone) {
    try {
      const auth = Buffer.from(`${org.twilioAccountSid}:${org.twilioAuthToken}`).toString("base64");
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${org.twilioAccountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: toPhone,
            From: org.twilioPhone,
            Body: body.slice(0, 320),
          }),
        },
      );
      status = res.ok ? "sent" : "failed";
    } catch {
      status = "failed";
    }
  }

  await prisma.smsMessage.create({
    data: {
      orgId: user.orgId,
      direction: "outbound",
      fromPhone: org?.twilioPhone || "platform",
      toPhone,
      body,
      status,
      readAt: new Date(),
    },
  });
  revalidatePath("/portal/settings");
  redirect(`/portal/settings?saved=1&tab=texts&sms=${status}`);
}

export async function addCoaDocument(formData: FormData) {
  const user = await requireUser();
  assertPracticeClinical(rolesOf(user.roles));
  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Title required");
  await prisma.coaDocument.create({
    data: {
      orgId: user.orgId,
      title,
      sku: String(formData.get("sku") || ""),
      lotNumber: String(formData.get("lotNumber") || ""),
      url: String(formData.get("url") || ""),
      notes: String(formData.get("notes") || ""),
    },
  });
  revalidatePath("/portal/resources");
  redirect("/portal/resources?coa=1");
}

export async function payPatientInvoiceByToken(formData: FormData) {
  const token = String(formData.get("token") || "");
  const invoice = await prisma.patientInvoice.findUnique({ where: { payToken: token } });
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "paid") redirect(`/pay/patient/${token}?already=1`);

  // Sandbox / practice-link capture: last4 stored for receipt display only.
  const last4 = String(formData.get("last4") || "").replace(/\D/g, "").slice(-4);
  await prisma.patientInvoice.update({
    where: { id: invoice.id },
    data: {
      status: "paid",
      paidAt: new Date(),
      description: `${invoice.description}${last4 ? ` · card •••• ${last4}` : " · paid online"}`,
    },
  });
  await notifyOrg({
    orgId: invoice.orgId,
    kind: "invoice.paid",
    title: `Patient paid ${invoice.invoiceNumber}`,
    href: "/portal/patient-invoices",
  });
  redirect(`/pay/patient/${token}?paid=1`);
}

export async function askRelayBot(formData: FormData) {
  const user = await requireUser();
  const question = String(formData.get("body") || "").trim().toLowerCase();
  if (!question) redirect("/portal/support");

  const answer = relayAnswer(question);
  await prisma.message.create({
    data: {
      orgId: user.orgId,
      authorName: user.name,
      authorUserId: user.id,
      body: `Relay Bot Q: ${String(formData.get("body") || "").trim()}`,
      channel: "rep",
      readAt: new Date(),
    },
  });
  await prisma.message.create({
    data: {
      orgId: user.orgId,
      authorName: "Relay Bot",
      authorUserId: "",
      body: answer,
      channel: "rep",
      readAt: new Date(),
    },
  });
  revalidatePath("/portal/support");
  redirect("/portal/support?bot=1");
}

function relayAnswer(q: string) {
  if (/script|escript|sign/.test(q)) {
    return "Open Script Requests to sign paid orders awaiting eScript, or submit a prescribe request for a doctor-network review. Path: /portal/script-requests";
  }
  if (/refill/.test(q)) {
    return "Patient refill requests and due schedules live under Refills. Approve a request to create a due draft, then approve + sign. Path: /portal/refills";
  }
  if (/invite|team|staff|prescriber/.test(q)) {
    return "Invite teammates from Team with a role. They claim a password at /claim-account. Path: /portal/team";
  }
  if (/patient|csv|signup/.test(q)) {
    return "Patients supports add, CSV import, signup link, portal invite, and Rx favorites. Path: /portal/patients";
  }
  if (/compound|marketplace|catalog|503/.test(q)) {
    return "Marketplace tabs cover 503A/503B/PUO/Lab/Supplies. Use Request compound for custom formulations. Path: /portal/catalog";
  }
  if (/telehealth|schedule|visit|calendar/.test(q)) {
    return "Scheduling supports new visits, block time, instant Jitsi rooms, and working hours. Path: /portal/telehealth";
  }
  if (/invoice|pay|billing/.test(q)) {
    return "Wholesale invoices are under Invoices; patient pay-links are under Patient invoices. Path: /portal/patient-invoices";
  }
  if (/brand|white.?label|logo/.test(q)) {
    return "Branding colors/name live in Settings → Branding and apply across the practice shell when active.";
  }
  return "I can help with scripts, refills, team invites, marketplace, patients, telehealth, invoices, and branding. Try asking about one of those, or message your Wellness Tech rep from Support.";
}
