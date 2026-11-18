import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { partnerSecretOk } from "@/lib/partner-org";
import { audit } from "@/lib/audit";
import { cancelOrder, notifyKianStatus } from "@/lib/eventide";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/partner/orders/:id/cancel — cancel VitaRelay order before ship. */
export async function POST(request: Request, ctx: Ctx) {
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
  if (["shipped", "delivered", "cancelled"].includes(order.status)) {
    return NextResponse.json(
      { ok: false, error: `Order is already ${order.status} and cannot be cancelled.` },
      { status: 409 },
    );
  }

  const remoteId = order.eventideOrderId || order.rxcoreOrderId;
  if (!remoteId) {
    return NextResponse.json({ ok: false, error: "No VitaRelay order id on this order." }, { status: 400 });
  }

  const result = await cancelOrder(remoteId);
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error:
          typeof result.data === "object" && result.data && "error" in result.data
            ? String((result.data as { error?: { message?: string } | string }).error)
            : `Cancel failed (${result.status}).`,
      },
      { status: result.status === 409 ? 409 : 502 },
    );
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: "cancelled", placementError: "" },
  });
  await prisma.orderLine.updateMany({ where: { orderId: order.id }, data: { lineStatus: "cancelled" } });
  await audit({ action: "eventide.order_cancelled", object: order.id, after: remoteId });
  await notifyKianStatus({
    externalRef: order.partnerExternalRef || order.invoiceNumber,
    status: "cancelled",
    event: "order.cancelled",
    eventideOrderId: remoteId,
  });

  return NextResponse.json({ ok: true, status: "cancelled", orderId: order.id, eventideOrderId: remoteId });
}
