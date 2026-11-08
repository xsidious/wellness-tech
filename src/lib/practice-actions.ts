"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requestClientMeta } from "@/lib/auth-security";
import { audit } from "@/lib/audit";
import {
  assertCanSignEscript,
  buildLinesSnapshot,
  buildPatientSnapshot,
  buildSignedEscriptPayload,
} from "@/lib/escript";
import { notifyKianStatus } from "@/lib/eventide";
import { requireUser, rolesOf } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { isProductClass, requiresEscript } from "@/lib/rules";
import { openRxcoreOrder } from "@/lib/rxcore";

export async function savePracticeOnboarding(formData: FormData) {
  const user = await requireUser();
  const roles = rolesOf(user.roles);
  if (!roles.some((r) => ["owner", "admin", "prescriber", "staff"].includes(r))) {
    throw new Error("Not allowed");
  }

  const label = String(formData.get("locationLabel") || "Main").trim() || "Main";
  const street1 = String(formData.get("street1") || "").trim();
  const city = String(formData.get("city") || "").trim();
  const state = String(formData.get("state") || "").trim();
  const zip = String(formData.get("zip") || "").trim();
  const phone = String(formData.get("phone") || "").trim();

  const existing = await prisma.practiceLocation.findFirst({
    where: { orgId: user.orgId, isDefault: true },
  });
  if (existing) {
    await prisma.practiceLocation.update({
      where: { id: existing.id },
      data: { label, street1, city, state, zip, phone },
    });
  } else {
    await prisma.practiceLocation.create({
      data: { orgId: user.orgId, label, street1, city, state, zip, phone, isDefault: true },
    });
  }

  const inviteEmail = String(formData.get("inviteEmail") || "").trim().toLowerCase();
  const inviteName = String(formData.get("inviteName") || "").trim();
  if (inviteEmail && inviteName) {
    const found = await prisma.user.findUnique({ where: { email: inviteEmail } });
    if (!found) {
      await prisma.user.create({
        data: {
          orgId: user.orgId,
          email: inviteEmail,
          name: inviteName,
          roles: JSON.stringify(["staff"]),
          passwordHash: "",
        },
      });
    }
  }

  await prisma.organization.update({
    where: { id: user.orgId },
    data: { onboardingComplete: Boolean(street1 && city && state && zip) },
  });

  await audit({
    actorId: user.id,
    action: "practice.onboarding",
    object: user.orgId,
    after: street1 ? "location+team" : "partial",
  });

  revalidatePath("/portal/settings");
  redirect("/portal/settings?saved=1");
}

export async function createPortalPatient(formData: FormData) {
  const user = await requireUser();
  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!fullName || !email) throw new Error("Name and email required");

  const patient = await prisma.clinicalPatient.create({
    data: {
      orgId: user.orgId,
      fullName,
      email,
      phone: String(formData.get("phone") || ""),
      dateOfBirth: String(formData.get("dateOfBirth") || ""),
      gender: String(formData.get("gender") || ""),
      allergies: String(formData.get("allergies") || ""),
      medications: String(formData.get("medications") || ""),
      addressJson: JSON.stringify({
        street1: String(formData.get("street1") || ""),
        city: String(formData.get("city") || ""),
        state: String(formData.get("state") || ""),
        zip: String(formData.get("zip") || ""),
      }),
      sourceSite: "portal-intake",
      intakeStatus: "intake_complete",
      programsJson: JSON.stringify(
        String(formData.get("programs") || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
      signaturesJson: JSON.stringify(
        formData.get("consentSignature")
          ? [{ type: "consent", dataUrl: String(formData.get("consentSignature")), at: new Date().toISOString() }]
          : [],
      ),
      clinicalChartJson: JSON.stringify({
        createdInPortal: true,
        consents: { hipaa: formData.get("consentHipaa") === "on", treatment: formData.get("consentTreatment") === "on" },
      }),
    },
  });

  await audit({ actorId: user.id, action: "patient.create", object: patient.id, after: patient.email });
  revalidatePath("/portal/patients");
  redirect(`/portal/patients/${patient.id}`);
}

export async function invitePatientPortal(formData: FormData) {
  const user = await requireUser();
  const clinicalPatientId = String(formData.get("clinicalPatientId") || "");
  const patient = await prisma.clinicalPatient.findFirst({
    where: { id: clinicalPatientId, orgId: user.orgId },
  });
  if (!patient) throw new Error("Patient not found");

  const existing = await prisma.user.findUnique({ where: { email: patient.email } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        clinicalPatientId: patient.id,
        roles: JSON.stringify(Array.from(new Set([...JSON.parse(existing.roles || "[]"), "patient"]))),
      },
    });
  } else {
    await prisma.user.create({
      data: {
        orgId: user.orgId,
        email: patient.email,
        name: patient.fullName,
        phone: patient.phone,
        roles: JSON.stringify(["patient"]),
        clinicalPatientId: patient.id,
        passwordHash: "",
      },
    });
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://www.wellnesstechdistribution.com").replace(/\/$/, "");
  const claimUrl = `${appUrl}/claim-account?email=${encodeURIComponent(patient.email)}`;
  try {
    const { sendTransactionalEmail } = await import("@/lib/email");
    await sendTransactionalEmail({
      to: patient.email,
      subject: `${user.org.legalName} invited you to your Wellness Tech patient portal`,
      text: [
        `Hi ${patient.fullName},`,
        "",
        `${user.org.legalName} invited you to view prescriptions, tracking, and refill requests online.`,
        "",
        `Activate your account: ${claimUrl}`,
        `Or sign in / request a magic code: ${appUrl}/login?next=/patient/portal`,
      ].join("\n"),
      html: `<div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#1a1a1a;max-width:520px">
        <p>Hi ${patient.fullName},</p>
        <p><strong>${user.org.legalName}</strong> invited you to view prescriptions, tracking, and refill requests online.</p>
        <p><a href="${claimUrl}">Activate your account</a></p>
        <p style="color:#555;font-size:14px">Already activated? <a href="${appUrl}/login?next=/patient/portal">Sign in</a> or request a magic code on the login page.</p>
      </div>`,
    });
  } catch (error) {
    console.error("patient invite email failed", error);
  }

  await audit({ actorId: user.id, action: "patient.invite", object: patient.id, after: patient.email });
  revalidatePath(`/portal/patients/${patient.id}`);
  revalidatePath("/portal/patients");
  redirect(`/portal/patients/${patient.id}?invited=1`);
}

export async function decidePatientRefillRequest(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "");
  if (!["approved", "declined"].includes(decision)) throw new Error("Invalid decision");

  const request = await prisma.refillRequest.findFirst({
    where: { id, clinicalPatient: { orgId: user.orgId } },
    include: { clinicalPatient: true },
  });
  if (!request) throw new Error("Refill request not found");

  await prisma.refillRequest.update({
    where: { id },
    data: { status: decision },
  });

  if (decision === "approved") {
    // Create a due refill draft the practice can convert with approveRefill.
    const due = new Date();
    due.setDate(due.getDate() + 1);
    await prisma.refill.create({
      data: {
        orgId: user.orgId,
        patientInitials: request.clinicalPatient.fullName
          .split(/\s+/)
          .map((p) => p[0] || "")
          .join("")
          .slice(0, 4)
          .toUpperCase() || "PT",
        productName: request.productName,
        productSku: request.productSku || "REFILL",
        dueAt: due,
        daysSupply: 30,
        status: "due",
        autopay: false,
      },
    });
  }

  await audit({
    actorId: user.id,
    action: `refill_request.${decision}`,
    object: id,
    after: request.productName,
  });

  revalidatePath("/portal/refills");
  revalidatePath("/portal");
  redirect(`/portal/refills?${decision}=1`);
}

export async function signEscript(formData: FormData) {
  const user = await requireUser();
  const orderId = String(formData.get("orderId") || "");
  const signatureDataUrl = String(formData.get("signatureDataUrl") || "");
  const meta = await requestClientMeta();

  const order = await prisma.order.findFirst({
    where: { id: orderId, orgId: user.orgId },
    include: { lines: true, escripts: true, clinicalPatient: true },
  });
  if (!order) redirect("/portal/orders");

  const needs = order.lines.some(
    (l) => requiresEscript(l.productClass, true) || l.productClass === "503A" || l.productClass === "503B",
  );
  if (!needs) redirect(`/portal/orders/${order.id}`);

  const alreadySigned = order.escripts.some((e) => e.status === "signed" && e.contentHash);
  if (alreadySigned && order.escriptStatus === "signed") {
    redirect(`/portal/orders/${order.id}/escript`);
  }

  const signed = buildSignedEscriptPayload({
    user,
    orderId: order.id,
    invoiceNumber: order.invoiceNumber,
    clinicalPatientId: order.clinicalPatientId,
    patient: buildPatientSnapshot(order.clinicalPatient),
    lines: buildLinesSnapshot(order.lines),
    signatureDataUrl,
    directions: String(formData.get("directions") || "As directed by prescribing clinician."),
    attestationAccepted: formData.get("attestationAccepted") === "1" || formData.get("attestationAccepted") === "on",
    ip: meta.ip,
    ua: meta.ua,
    licenseState: String(formData.get("licenseState") || ""),
  });
  if (!signed.ok) {
    redirect(`/portal/orders/${order.id}?error=${encodeURIComponent(signed.error)}`);
  }

  const draft = order.escripts.find((e) => e.status !== "signed");
  if (draft) {
    await prisma.eScript.update({ where: { id: draft.id }, data: signed.data });
  } else {
    await prisma.eScript.create({ data: { orderId: order.id, ...signed.data } });
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      escriptStatus: "signed",
      status: order.status === "on_hold" ? "submitted" : order.status,
      prescriberJson: JSON.stringify({
        displayName: signed.data.displayName,
        npi: signed.data.npi,
        email: signed.data.signerEmail,
        licenseState: signed.data.licenseState,
        licenseNumber: signed.data.licenseNumber,
      }),
    },
  });

  const eventide = await prisma.pharmacy.findFirst({
    where: { name: { contains: "Eventide", mode: "insensitive" } },
  });
  if (eventide) {
    await prisma.order.update({ where: { id: order.id }, data: { pharmacyId: eventide.id } });
  }

  await openRxcoreOrder({
    orderId: order.id,
    lines: order.lines
      .filter((line) => isProductClass(line.productClass))
      .map((line) => ({
        productClass: line.productClass as "503A",
        patientInitials: line.patientInitials,
      })),
  });

  await audit({
    actorId: user.id,
    action: "escript.signed",
    object: order.id,
    after: signed.data.contentHash,
    ip: meta.ip,
  });
  revalidatePath(`/portal/orders/${order.id}`);
  revalidatePath("/admin/prescriptions");
  redirect(`/portal/orders/${order.id}/escript`);
}

export async function requestPatientRefill(formData: FormData) {
  const user = await requireUser();
  if (!user.clinicalPatientId) throw new Error("Patient account required");
  await prisma.refillRequest.create({
    data: {
      clinicalPatientId: user.clinicalPatientId,
      productName: String(formData.get("productName") || "Refill"),
      productSku: String(formData.get("productSku") || ""),
      note: String(formData.get("note") || ""),
      status: "requested",
    },
  });
  revalidatePath("/patient/portal");
  redirect("/patient/portal?refill=1");
}

export async function sendPatientMessage(formData: FormData) {
  const user = await requireUser();
  const body = String(formData.get("body") || "").trim();
  if (!body || !user.clinicalPatientId) redirect("/patient/portal");
  await prisma.message.create({
    data: {
      orgId: user.orgId,
      authorName: user.name,
      authorUserId: user.id,
      body,
      channel: "patient",
      clinicalPatientId: user.clinicalPatientId,
    },
  });
  revalidatePath("/patient/portal");
  revalidatePath("/portal/messages");
  redirect("/patient/portal?sent=1");
}

export async function replyPatientMessage(formData: FormData) {
  const user = await requireUser();
  const body = String(formData.get("body") || "").trim();
  const clinicalPatientId = String(formData.get("clinicalPatientId") || "");
  if (!body || !clinicalPatientId) redirect("/portal/messages");

  const patient = await prisma.clinicalPatient.findFirst({
    where: { id: clinicalPatientId, orgId: user.orgId },
  });
  if (!patient) throw new Error("Patient not found");

  await prisma.message.create({
    data: {
      orgId: user.orgId,
      authorName: user.name,
      authorUserId: user.id,
      body,
      channel: "patient",
      clinicalPatientId: patient.id,
      // Practice reply is already "read" for the practice inbox.
      readAt: new Date(),
    },
  });

  revalidatePath("/portal/messages");
  revalidatePath("/patient/portal");
  redirect(`/portal/messages?patient=${patient.id}&sent=1`);
}

export async function markPatientMessagesRead(formData: FormData) {
  const user = await requireUser();
  const clinicalPatientId = String(formData.get("clinicalPatientId") || "");
  if (!clinicalPatientId) redirect("/portal/messages");

  await prisma.message.updateMany({
    where: {
      orgId: user.orgId,
      channel: "patient",
      clinicalPatientId,
      readAt: null,
      // Only mark inbound patient notes (not our own replies).
      NOT: { authorUserId: user.id },
    },
    data: { readAt: new Date() },
  });

  revalidatePath("/portal/messages");
  redirect(`/portal/messages?patient=${clinicalPatientId}`);
}

/** Re-export for pharmacy fulfill path type-check convenience */
export async function pushTrackingToKian(orderId: string, status: string, trackingNumber?: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;
  await notifyKianStatus({
    externalRef: order.partnerExternalRef || order.invoiceNumber,
    status,
    trackingNumber,
    event: `order.${status}`,
    occurredAt: new Date().toISOString(),
  });
}

// Keep assert available for page gates
export { assertCanSignEscript };
