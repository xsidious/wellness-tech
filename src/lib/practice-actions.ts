"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
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

  await audit({ actorId: user.id, action: "patient.invite", object: patient.id, after: patient.email });
  revalidatePath(`/portal/patients/${patient.id}`);
  redirect(`/portal/patients/${patient.id}?invited=1`);
}

export async function signEscript(formData: FormData) {
  const user = await requireUser();
  const orderId = String(formData.get("orderId") || "");
  const signatureDataUrl = String(formData.get("signatureDataUrl") || "");
  if (!signatureDataUrl.startsWith("data:image")) {
    redirect(`/portal/orders/${orderId}?error=signature`);
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, orgId: user.orgId },
    include: { lines: true, escripts: true },
  });
  if (!order) redirect("/portal/orders");

  const needs = order.lines.some((l) => requiresEscript(l.productClass, true) || l.productClass === "503A" || l.productClass === "503B");
  if (!needs) redirect(`/portal/orders/${order.id}`);

  const draft = order.escripts.find((e) => e.status !== "signed") || order.escripts[0];
  const data = {
    status: "signed",
    signatureDataUrl,
    signedById: user.id,
    signedAt: new Date(),
    npi: user.credential?.npi || "",
    displayName: user.credential?.displayName || user.name,
    directions: String(formData.get("directions") || "As directed"),
    clinicalPatientId: order.clinicalPatientId,
  };

  if (draft) {
    await prisma.eScript.update({ where: { id: draft.id }, data });
  } else {
    await prisma.eScript.create({ data: { orderId: order.id, ...data } });
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { escriptStatus: "signed" },
  });

  // Forward to pharmacy once signed
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

  await audit({ actorId: user.id, action: "escript.signed", object: order.id });
  revalidatePath(`/portal/orders/${order.id}`);
  redirect(`/portal/orders/${order.id}`);
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
  if (!body) redirect("/patient/portal");
  await prisma.message.create({
    data: {
      orgId: user.orgId,
      authorName: user.name,
      body,
    },
  });
  revalidatePath("/patient/portal");
  redirect("/patient/portal?sent=1");
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
