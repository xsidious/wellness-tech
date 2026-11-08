"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requireUser, rolesOf } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export async function ensureAffiliatePartnerLink() {
  const user = await requireUser();
  if (!user.affiliate) return;
  if (user.affiliate.partnerLink) return user.affiliate.partnerLink;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://www.thewellnesstech.com").replace(/\/$/, "");
  const partnerLink = `${appUrl}/signup?ref=${user.affiliate.code}`;
  await prisma.affiliateProfile.update({
    where: { id: user.affiliate.id },
    data: { partnerLink },
  });
  return partnerLink;
}

/** Admin: mark pending commissions paid and open an affiliate settlement. */
export async function runAffiliatePayout(formData: FormData) {
  const user = await requireUser();
  if (!rolesOf(user.roles).includes("admin")) throw new Error("Admin only");

  const affiliateUserId = String(formData.get("affiliateUserId") || "") || null;
  const pending = await prisma.commission.findMany({
    where: {
      status: "pending_batch",
      ...(affiliateUserId ? { affiliateUserId } : {}),
    },
    take: 500,
  });

  const totalCents = pending.reduce((s, c) => s + c.amountCents, 0);
  const periodEnd = new Date();
  const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const settlement = await prisma.settlement.create({
    data: {
      kind: "affiliate",
      status: "open",
      periodStart,
      periodEnd,
      totalCents,
      notes: affiliateUserId ? `Payout for ${affiliateUserId}` : "Network affiliate payout run",
      lines: {
        create: pending.map((c) => ({
          orderId: c.orderId,
          label: `Commission ${c.id.slice(0, 8)}`,
          amountCents: c.amountCents,
        })),
      },
    },
  });

  await prisma.commission.updateMany({
    where: { id: { in: pending.map((c) => c.id) } },
    data: { status: "paid" },
  });

  await audit({
    actorId: user.id,
    action: "affiliate.payout_run",
    object: settlement.id,
    after: `${pending.length} commissions`,
  });

  revalidatePath("/admin/affiliates");
  revalidatePath("/admin/settlements");
  redirect(`/admin/settlements/${settlement.id}`);
}

export async function updateAffiliateW9(formData: FormData) {
  const user = await requireUser();
  if (!user.affiliate) throw new Error("Affiliate profile required");
  const status = String(formData.get("w9Status") || "").trim();
  // Affiliates may mark submitted/rejected only — verified is ops-controlled.
  if (!["sandbox_received", "submitted", "rejected"].includes(status)) {
    throw new Error("Invalid W-9 status");
  }
  await prisma.affiliateProfile.update({
    where: { id: user.affiliate.id },
    data: { w9Status: status },
  });
  await audit({
    actorId: user.id,
    action: "affiliate.w9",
    object: user.affiliate.id,
    after: status,
  });
  revalidatePath("/portal/affiliate");
  redirect("/portal/affiliate?w9=1");
}
