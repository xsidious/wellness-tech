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

export async function upsertPharmacy(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Name required");
  const data = {
    name,
    type: String(formData.get("type") || "Hybrid"),
    region: String(formData.get("region") || ""),
    status: String(formData.get("status") || "online"),
    description: String(formData.get("description") || ""),
    sla: String(formData.get("sla") || ""),
    specialtiesJson: JSON.stringify(
      String(formData.get("specialties") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
    capabilitiesJson: JSON.stringify(
      String(formData.get("capabilities") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
    erpJson: JSON.stringify(
      String(formData.get("erp") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
    contactEmail: String(formData.get("contactEmail") || ""),
  };

  const pharmacy = id
    ? await prisma.pharmacy.update({ where: { id }, data })
    : await prisma.pharmacy.create({ data });

  await audit({
    actorId: user.id,
    action: id ? "pharmacy.update" : "pharmacy.create",
    object: `pharmacy:${pharmacy.id}`,
    after: pharmacy.name,
  });

  revalidatePath("/admin/pharmacies");
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
