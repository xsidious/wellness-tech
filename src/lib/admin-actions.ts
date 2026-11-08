"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, rolesOf } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

async function requireAdmin() {
  const user = await requireUser();
  if (!rolesOf(user.roles).includes("admin")) throw new Error("Admin only");
  return user;
}

function listField(formData: FormData, key: string) {
  return JSON.stringify(
    String(formData.get(key) || "")
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export async function upsertPharmacy(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Name required");

  const data = {
    name,
    legalName: String(formData.get("legalName") || "").trim(),
    type: String(formData.get("type") || "Hybrid").trim(),
    region: String(formData.get("region") || "").trim(),
    status: String(formData.get("status") || "online").trim(),
    description: String(formData.get("description") || "").trim(),
    sla: String(formData.get("sla") || "").trim(),
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
    hours: String(formData.get("hours") || "").trim(),
    coldChain: formData.get("coldChain") === "on",
    patientShip: formData.get("patientShip") === "on",
    practiceShip: formData.get("practiceShip") === "on",
    internalNotes: String(formData.get("internalNotes") || "").trim(),
    specialtiesJson: listField(formData, "specialties"),
    capabilitiesJson: listField(formData, "capabilities"),
    erpJson: listField(formData, "erp"),
    statesServedJson: listField(formData, "statesServed"),
    shippingModesJson: listField(formData, "shippingModes"),
  };

  const pharmacy = id
    ? await prisma.pharmacy.update({ where: { id }, data })
    : await prisma.pharmacy.create({ data });

  // Keep a matching HQ location in sync when address is provided.
  if (data.street1 || data.city) {
    const existingDefault = await prisma.pharmacyLocation.findFirst({
      where: { pharmacyId: pharmacy.id, isDefault: true },
    });
    if (existingDefault) {
      await prisma.pharmacyLocation.update({
        where: { id: existingDefault.id },
        data: {
          label: existingDefault.label || "HQ",
          street1: data.street1,
          city: data.city,
          state: data.state,
          zip: data.zip,
        },
      });
    } else {
      await prisma.pharmacyLocation.create({
        data: {
          pharmacyId: pharmacy.id,
          label: "HQ",
          street1: data.street1,
          city: data.city,
          state: data.state,
          zip: data.zip,
          isDefault: true,
        },
      });
    }
  }

  await audit({
    actorId: user.id,
    action: id ? "pharmacy.update" : "pharmacy.create",
    object: `pharmacy:${pharmacy.id}`,
    after: pharmacy.name,
  });

  revalidatePath("/admin/pharmacies");
  revalidatePath(`/admin/pharmacies/${pharmacy.id}`);
  revalidatePath("/portal/pharmacies");
  revalidatePath("/pharmacy/profile");
  redirect(`/admin/pharmacies/${pharmacy.id}`);
}

export async function createSettlement(formData: FormData) {
  const user = await requireAdmin();
  const kind = String(formData.get("kind") || "practice");
  const orgId = String(formData.get("orgId") || "") || null;
  const periodStart = new Date(String(formData.get("periodStart") || Date.now()));
  const periodEnd = new Date(String(formData.get("periodEnd") || Date.now()));

  const orders = await prisma.order.findMany({
    where: {
      paymentStatus: "paid",
      createdAt: { gte: periodStart, lte: periodEnd },
      ...(orgId ? { orgId } : {}),
    },
    take: 500,
  });

  const totalCents = orders.reduce((sum, o) => sum + o.totalCents, 0);
  const settlement = await prisma.settlement.create({
    data: {
      orgId,
      kind,
      periodStart,
      periodEnd,
      status: "open",
      totalCents,
      notes: String(formData.get("notes") || ""),
      lines: {
        create: orders.map((o) => ({
          orderId: o.id,
          label: o.invoiceNumber,
          amountCents: o.totalCents,
        })),
      },
    },
  });

  await audit({
    actorId: user.id,
    action: "settlement.create",
    object: `settlement:${settlement.id}`,
    after: `${orders.length} lines`,
  });

  revalidatePath("/admin/settlements");
  redirect(`/admin/settlements/${settlement.id}`);
}

export async function closeSettlement(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("id") || "");
  await prisma.settlement.update({
    where: { id },
    data: { status: "closed", closedAt: new Date() },
  });
  await audit({ actorId: user.id, action: "settlement.close", object: `settlement:${id}` });
  revalidatePath("/admin/settlements");
  revalidatePath(`/admin/settlements/${id}`);
}
