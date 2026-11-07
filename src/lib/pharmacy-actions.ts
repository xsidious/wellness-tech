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
      data: { status: "on_hold", notes: `${order.notes}\nHold by ${user.name}: ${String(formData.get("holdReason") || "")}`.trim() },
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
  revalidatePath(`/pharmacy/orders/${order.id}`);
  redirect(`/pharmacy/orders/${order.id}`);
}

export async function addPharmacyLocation(formData: FormData) {
  const user = await requirePharmacyUser();
  if (!user.pharmacyId) throw new Error("No pharmacy linked to this user");
  await prisma.pharmacyLocation.create({
    data: {
      pharmacyId: user.pharmacyId,
      label: String(formData.get("label") || "Location"),
      street1: String(formData.get("street1") || ""),
      city: String(formData.get("city") || ""),
      state: String(formData.get("state") || ""),
      zip: String(formData.get("zip") || ""),
      isDefault: formData.get("isDefault") === "on",
    },
  });
  revalidatePath("/pharmacy/locations");
  redirect("/pharmacy/locations");
}
