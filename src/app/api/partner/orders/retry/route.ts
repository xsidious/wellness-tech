import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { partnerSecretOk } from "@/lib/partner-org";
import { retryRxHereSubmission } from "@/lib/rxcore";

/**
 * POST /api/partner/orders/retry
 * Body: { orderId?: string, externalRef?: string }
 * Re-submits a KIAN-forwarded order to RxHere when the first pharmacy call failed (e.g. 502).
 */
export async function POST(request: Request) {
  if (!partnerSecretOk(request.headers.get("x-wt-partner-secret"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    orderId?: string;
    externalRef?: string;
  } | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });

  const orderId = String(body.orderId || "").trim();
  const externalRef = String(body.externalRef || "").trim();
  if (!orderId && !externalRef) {
    return NextResponse.json({ ok: false, error: "orderId or externalRef is required." }, { status: 400 });
  }

  const order =
    (orderId ? await prisma.order.findUnique({ where: { id: orderId } }) : null) ||
    (externalRef ? await prisma.order.findFirst({ where: { partnerExternalRef: externalRef } }) : null);

  if (!order) {
    return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
  }

  const result = await retryRxHereSubmission(order.id);
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        orderId: order.id,
        invoiceNumber: order.invoiceNumber,
        status: "on_hold",
      },
      { status: 502 },
    );
  }

  const refreshed = await prisma.order.findUnique({ where: { id: order.id } });
  return NextResponse.json({
    ok: true,
    orderId: order.id,
    invoiceNumber: order.invoiceNumber,
    rxhereOrderId: result.orderId,
    duplicate: result.duplicate,
    status: refreshed?.status || "submitted",
  });
}
