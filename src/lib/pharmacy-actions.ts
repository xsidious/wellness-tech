"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { notifyKianStatus } from "@/lib/eventide";
import { requireUser, rolesOf } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { emitOrderEvent } from "@/lib/rxcore";

async function requirePharmacyUser() {
  const user = await requireUser("/pharmacy");
  const roles = rolesOf(user.roles);
  if (!roles.includes("pharmacy") && !roles.includes("admin")) {
    throw new Error("Pharmacy role required");
  }
  return user;
}

function pharmacyIdOrThrow(user: { pharmacyId: string | null; roles: string }) {
  if (user.pharmacyId) return user.pharmacyId;
  if (rolesOf(user.roles).includes("admin")) {
    throw new Error("Link a pharmacyId on this admin user, or edit pharmacies from /admin/pharmacies.");
  }
  throw new Error("No pharmacy linked to this user");
}

export async function fulfillPharmacyOrder(formData: FormData) {
  const user = await requirePharmacyUser();
  const orderId = String(formData.get("orderId") || "");
  const trackingNumber = String(formData.get("trackingNumber") || "").trim();
  const status = String(formData.get("status") || "shipped");
  const hold = formData.get("hold") === "on";

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      ...(user.pharmacyId ? { pharmacyId: user.pharmacyId } : {}),
    },
  });
  if (!order) throw new Error("Order not found in your queue");

  if (hold) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "on_hold",
        notes: `${order.notes}\nHold by ${user.name}: ${String(formData.get("holdReason") || "")}`.trim(),
      },
    });
    await emitOrderEvent(order.id, "order.on_hold", String(formData.get("holdReason") || "availability"));
    await notifyKianStatus({
      externalRef: order.partnerExternalRef || order.invoiceNumber,
      status: "on_hold",
      event: "order.on_hold",
      occurredAt: new Date().toISOString(),
      reason: String(formData.get("holdReason") || ""),
    });
  } else {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status,
        trackingNumber: trackingNumber || order.trackingNumber,
      },
    });
    await emitOrderEvent(order.id, `order.${status}`);
    await notifyKianStatus({
      externalRef: order.partnerExternalRef || order.invoiceNumber,
      status,
      trackingNumber: trackingNumber || order.trackingNumber || undefined,
      event: `order.${status}`,
      occurredAt: new Date().toISOString(),
    });
  }

  await audit({
    actorId: user.id,
    action: hold ? "pharmacy.hold" : "pharmacy.fulfill",
    object: order.id,
    after: trackingNumber || status,
  });

  revalidatePath("/pharmacy");
  revalidatePath("/pharmacy/orders");
  revalidatePath("/pharmacy/reports");
  revalidatePath(`/pharmacy/orders/${order.id}`);
  redirect(`/pharmacy/orders/${order.id}`);
}

function listFromForm(formData: FormData, key: string) {
  return JSON.stringify(
    String(formData.get(key) || "")
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export async function updatePharmacyProfile(formData: FormData) {
  const user = await requirePharmacyUser();
  const pharmacyId = pharmacyIdOrThrow(user);

  await prisma.pharmacy.update({
    where: { id: pharmacyId },
    data: {
      name: String(formData.get("name") || "").trim() || undefined,
      legalName: String(formData.get("legalName") || "").trim(),
      type: String(formData.get("type") || "").trim() || undefined,
      region: String(formData.get("region") || "").trim(),
      status: String(formData.get("status") || "online").trim(),
      hours: String(formData.get("hours") || "").trim(),
      contactName: String(formData.get("contactName") || "").trim(),
      contactEmail: String(formData.get("contactEmail") || "").trim().toLowerCase(),
      phone: String(formData.get("phone") || "").trim(),
      website: String(formData.get("website") || "").trim(),
      licenseNumber: String(formData.get("licenseNumber") || "").trim(),
      licenseState: String(formData.get("licenseState") || "").trim().toUpperCase().slice(0, 2),
      npi: String(formData.get("npi") || "").trim(),
      deaNumber: String(formData.get("deaNumber") || "").trim(),
      ncpdpId: String(formData.get("ncpdpId") || "").trim(),
      street1: String(formData.get("street1") || "").trim(),
      city: String(formData.get("city") || "").trim(),
      state: String(formData.get("state") || "").trim().toUpperCase().slice(0, 2),
      zip: String(formData.get("zip") || "").trim(),
      sla: String(formData.get("sla") || "").trim(),
      description: String(formData.get("description") || "").trim(),
      coldChain: formData.get("coldChain") === "on",
      patientShip: formData.get("patientShip") === "on",
      practiceShip: formData.get("practiceShip") === "on",
      specialtiesJson: listFromForm(formData, "specialties"),
      capabilitiesJson: listFromForm(formData, "capabilities"),
      erpJson: listFromForm(formData, "erp"),
      statesServedJson: listFromForm(formData, "statesServed"),
      shippingModesJson: listFromForm(formData, "shippingModes"),
    },
  });

  await audit({
    actorId: user.id,
    action: "pharmacy.profile",
    object: pharmacyId,
    after: String(formData.get("name") || ""),
  });

  revalidatePath("/pharmacy");
  revalidatePath("/pharmacy/profile");
  revalidatePath("/portal/pharmacies");
  redirect("/pharmacy/profile?saved=1");
}

export async function addPharmacyLocation(formData: FormData) {
  const user = await requirePharmacyUser();
  const pharmacyId = pharmacyIdOrThrow(user);
  const isDefault = formData.get("isDefault") === "on";
  if (isDefault) {
    await prisma.pharmacyLocation.updateMany({
      where: { pharmacyId },
      data: { isDefault: false },
    });
  }
  await prisma.pharmacyLocation.create({
    data: {
      pharmacyId,
      label: String(formData.get("label") || "Location"),
      street1: String(formData.get("street1") || ""),
      city: String(formData.get("city") || ""),
      state: String(formData.get("state") || ""),
      zip: String(formData.get("zip") || ""),
      isDefault,
    },
  });
  revalidatePath("/pharmacy/locations");
  redirect("/pharmacy/locations?saved=1");
}

export async function updatePharmacyLocation(formData: FormData) {
  const user = await requirePharmacyUser();
  const pharmacyId = pharmacyIdOrThrow(user);
  const id = String(formData.get("id") || "");
  const location = await prisma.pharmacyLocation.findFirst({ where: { id, pharmacyId } });
  if (!location) throw new Error("Location not found");

  const isDefault = formData.get("isDefault") === "on";
  if (isDefault) {
    await prisma.pharmacyLocation.updateMany({
      where: { pharmacyId, NOT: { id } },
      data: { isDefault: false },
    });
  }

  await prisma.pharmacyLocation.update({
    where: { id },
    data: {
      label: String(formData.get("label") || location.label),
      street1: String(formData.get("street1") || ""),
      city: String(formData.get("city") || ""),
      state: String(formData.get("state") || ""),
      zip: String(formData.get("zip") || ""),
      isDefault,
    },
  });

  revalidatePath("/pharmacy/locations");
  redirect("/pharmacy/locations?saved=1");
}

export async function invitePharmacyStaff(formData: FormData) {
  const user = await requirePharmacyUser();
  const pharmacyId = pharmacyIdOrThrow(user);
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const name = String(formData.get("name") || "").trim();
  if (!email || !name) throw new Error("Name and email required");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const roles = Array.from(new Set([...rolesOf(existing.roles), "pharmacy"]));
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        pharmacyId,
        name: name || existing.name,
        roles: JSON.stringify(roles),
      },
    });
  } else {
    await prisma.user.create({
      data: {
        orgId: user.orgId,
        email,
        name,
        roles: JSON.stringify(["pharmacy"]),
        pharmacyId,
        passwordHash: "",
      },
    });
  }

  await audit({
    actorId: user.id,
    action: "pharmacy.staff.invite",
    object: pharmacyId,
    after: email,
  });

  revalidatePath("/pharmacy/staff");
  redirect("/pharmacy/staff?invited=1");
}
