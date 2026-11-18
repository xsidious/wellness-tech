import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { partnerSecretOk } from "@/lib/partner-org";

/**
 * GET /api/partner/orders/:id
 * Status + tracking for KIAN poll backup. :id may be WT order id, invoice, partnerExternalRef, or VitaRelay id.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!partnerSecretOk(request.headers.get("x-wt-partner-secret"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const id = decodeURIComponent((await ctx.params).id || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Missing id." }, { status: 400 });

  const order =
    (await prisma.order.findUnique({ where: { id } })) ||
    (await prisma.order.findFirst({ where: { invoiceNumber: id } })) ||
    (await prisma.order.findFirst({ where: { partnerExternalRef: id } })) ||
    (await prisma.order.findFirst({
      where: { OR: [{ eventideOrderId: id }, { rxcoreOrderId: id }] },
    }));

  if (!order) return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    invoiceNumber: order.invoiceNumber,
    partnerExternalRef: order.partnerExternalRef,
    status: order.status,
    paymentStatus: order.paymentStatus,
    trackingNumber: order.trackingNumber || null,
    carrier: order.trackingCarrier || null,
    trackingUrl: order.trackingUrl || null,
    eventideOrderId: order.eventideOrderId || null,
    lastWebhookAt: order.lastWebhookAt?.toISOString() || null,
    placementError: order.placementError || null,
    fulfillment: {
      status: order.status,
      trackingNumber: order.trackingNumber || null,
      carrier: order.trackingCarrier || null,
      trackingUrl: order.trackingUrl || null,
    },
  });
}
