import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refreshOrderFromEventide } from "@/lib/eventide";

/**
 * Backup poll for VitaRelay tracking when webhooks are delayed.
 * Secure with CRON_SECRET (Authorization: Bearer …) or Vercel cron.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() || process.env.WT_CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") || "";
  const headerSecret = request.headers.get("x-cron-secret") || "";
  if (secret) {
    const ok =
      auth === `Bearer ${secret}` || headerSecret === secret || request.headers.get("x-vercel-cron") === "1";
    if (!ok) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const open = await prisma.order.findMany({
    where: {
      rxhereOrderId: { not: "" },
      status: { notIn: ["delivered", "cancelled"] },
    },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { id: true, invoiceNumber: true, rxhereOrderId: true },
  });

  const results: Array<{ id: string; invoiceNumber: string; ok: boolean; status?: string; error?: string }> = [];
  for (const order of open) {
    const refreshed = await refreshOrderFromEventide(order.id);
    results.push({
      id: order.id,
      invoiceNumber: order.invoiceNumber,
      ok: refreshed.ok,
      status: refreshed.ok ? refreshed.status : undefined,
      error: refreshed.ok ? undefined : refreshed.error,
    });
  }

  return NextResponse.json({ ok: true, polled: results.length, results });
}
