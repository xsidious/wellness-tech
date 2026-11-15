import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { partnerSecretOk } from "@/lib/partner-org";

/** GET /api/partner/orders/status?id=… — alias for KIAN poll clients. */
export async function GET(request: Request) {
  if (!partnerSecretOk(request.headers.get("x-wt-partner-secret"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get("id")?.trim() || "";
  if (!id) return NextResponse.json({ ok: false, error: "Missing id." }, { status: 400 });

  const order =
    (await prisma.order.findUnique({ where: { id } })) ||
    (await prisma.order.findFirst({ where: { invoiceNumber: id } })) ||
    (await prisma.order.findFirst({ where: { partnerExternalRef: id } })) ||
    (await prisma.order.findFirst({
      where: { OR: [{ rxhereOrderId: id }, { rxcoreOrderId: id }] },
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
    rxhereOrderId: order.rxhereOrderId || null,
    lastWebhookAt: order.lastWebhookAt?.toISOString() || null,
    fulfillment: {
      status: order.status,
      trackingNumber: order.trackingNumber || null,
      carrier: order.trackingCarrier || null,
      trackingUrl: order.trackingUrl || null,
    },
  });
}
