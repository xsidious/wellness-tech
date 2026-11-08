import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { canOrder, commissionCents, isProductClass, routeSource, shippingCents, type ProductClass } from "@/lib/rules";
import { signWebhook, verifyWebhook } from "@/lib/crypto";
import { placePrescriptionOrder, rxhereConfigured, type RxHerePatient, type RxHerePrescriber } from "@/lib/rxhere";

const STATUS: Record<string, string> = {
  "order.received": "received",
  "order.verified": "verified",
  "order.on_hold": "on_hold",
  "order.compounding": "compounding",
  "order.shipped": "shipped",
  "order.delivered": "delivered",
  "order.delayed": "delayed",
};

export function nextEvent(status: string) {
  const order = ["received", "verified", "compounding", "shipped", "delivered"];
  const index = order.indexOf(status);
  if (index < 0 || index >= order.length - 1) return null;
  return `order.${order[index + 1]}`;
}

export async function ensurePatient(orgId: string, initials: string) {
  const clean = initials.trim().slice(0, 8);
  if (!clean) return null;
  const existing = await prisma.patientRef.findFirst({ where: { orgId, initials: clean } });
  if (existing) return existing;
  return prisma.patientRef.create({
    data: {
      orgId,
      initials: clean,
      rxcorePatientId: `pat_${randomBytes(6).toString("hex")}`,
    },
  });
}

export async function ingestWebhook(body: string, signature: string) {
  if (!verifyWebhook(body, signature)) {
    return { ok: false as const, status: 401, error: "Invalid signature." };
  }
  const payload = JSON.parse(body) as { id: string; type: string; orderId: string; reason?: string };
  const duplicate = await prisma.orderEvent.findUnique({ where: { eventId: payload.id } });
  if (duplicate) return { ok: true as const, duplicate: true };
  const order = await prisma.order.findUnique({ where: { id: payload.orderId }, include: { lines: true, org: true } });
  if (!order) return { ok: false as const, status: 404, error: "Order not found." };
  const status = STATUS[payload.type];
  if (!status) return { ok: false as const, status: 400, error: "Unknown event." };

  await prisma.orderEvent.create({
    data: { orderId: order.id, eventId: payload.id, type: payload.type, payload: body },
  });
  await prisma.webhookDelivery.create({
    data: { eventId: payload.id, type: payload.type, payload: body, status: "delivered" },
  });
  await prisma.order.update({ where: { id: order.id }, data: { status } });
  await prisma.orderLine.updateMany({ where: { orderId: order.id }, data: { lineStatus: status } });

  try {
    const { notifyOrg } = await import("@/lib/notifications");
    await notifyOrg({
      orgId: order.orgId,
      kind: payload.type,
      title: `Order ${order.invoiceNumber} · ${status}`,
      body: payload.reason || `Fulfillment status updated to ${status}.`,
      href: `/portal/orders/${order.id}`,
      email: true,
    });
  } catch (error) {
    console.error("order status notification failed", error);
  }

  if (payload.type === "order.delivered" && order.org.referringAffiliateId) {
    const affiliate = await prisma.affiliateProfile.findUnique({ where: { userId: order.org.referringAffiliateId } });
    if (affiliate) {
      let eligible = 0;
      let amount = 0;
      for (const line of order.lines) {
        if (!isProductClass(line.productClass)) continue;
        const lineCents = line.unitPriceCents * line.qty;
        const commission = commissionCents(line.productClass as ProductClass, lineCents);
        if (commission > 0) {
          eligible += lineCents;
          amount += commission;
        }
      }
      if (amount > 0) {
        await prisma.commission.create({
          data: {
            affiliateUserId: affiliate.userId,
            orgId: order.orgId,
            orderId: order.id,
            eligibleCents: eligible,
            rateBps: 1000,
            amountCents: amount,
            status: "pending_batch",
          },
        });
      }
    }
  }

  if (payload.type === "order.delivered") {
    const due = new Date(Date.now() + 1000 * 60 * 60 * 24 * 21);
    for (const line of order.lines) {
      if (line.productClass !== "503A" || !line.daysSupply) continue;
      await prisma.refill.create({
        data: {
          orgId: order.orgId,
          patientInitials: line.patientInitials,
          productName: line.name,
          productSku: line.sku,
          dueAt: due,
          daysSupply: line.daysSupply,
          status: "due",
          autopay: Boolean(order.paymentToken),
        },
      });
    }
  }

  return { ok: true as const, duplicate: false, status: status };
}

export async function emitOrderEvent(orderId: string, type: string, reason?: string) {
  const body = JSON.stringify({
    id: `evt_${randomBytes(8).toString("hex")}`,
    type,
    orderId,
    reason: reason ?? "",
    at: new Date().toISOString(),
  });
  return ingestWebhook(body, signWebhook(body));
}

export async function openRxcoreOrder(input: {
  orderId: string;
  lines: { productClass: ProductClass; patientInitials: string }[];
  /** When set, 503A lines are submitted to Eventide (VitaRelay Practice API). */
  prescription?: {
    patient: RxHerePatient;
    prescriber?: RxHerePrescriber;
    shippingMethod?: "2_DAY" | "OVERNIGHT";
    platformProductIdBySku?: Record<string, string>;
  };
}) {
  const order = await prisma.order.findUnique({ where: { id: input.orderId }, include: { lines: true } });
  if (!order) throw new Error("Order not found.");

  for (const line of input.lines) {
    await prisma.orderLine.updateMany({
      where: { orderId: input.orderId, productClass: line.productClass },
      data: { routedSource: routeSource(line.productClass) },
    });
  }

  const rxLines = order.lines.filter((line) => line.productClass === "503A");
  if (rxhereConfigured() && input.prescription && rxLines.length) {
    const placed = await placePrescriptionOrder({
      partnerOrderId: order.partnerExternalRef || order.invoiceNumber,
      shippingMethod: input.prescription.shippingMethod || (order.shippingMethod as "2_DAY" | "OVERNIGHT") || "2_DAY",
      items: rxLines.map((line) => ({
        sku: line.sku,
        platformProductId: input.prescription?.platformProductIdBySku?.[line.sku],
        name: line.name,
        strength: line.strength || undefined,
        size: line.size || undefined,
        dosageForm: line.dosageForm || undefined,
        quantity: line.qty,
        sig: line.sig || "As directed by prescribing clinician.",
      })),
      patient: input.prescription.patient,
      prescriber: input.prescription.prescriber,
    });
    if (!placed.ok) {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "on_hold", splitMessage: placed.error },
      });
      throw new Error(placed.error);
    }
    await prisma.order.update({
      where: { id: order.id },
      data: {
        rxcoreOrderId: placed.orderId,
        rxhereOrderId: placed.orderId,
        rxhereBatchId: placed.batchId || "",
        status: "submitted",
        splitMessage: "",
      },
    });
    await audit({ action: "eventide.order_opened", object: order.id, after: placed.orderId });
    await emitOrderEvent(order.id, "order.received");
    return placed.orderId;
  }

  const rxcoreOrderId = `RXC-${randomBytes(4).toString("hex").toUpperCase()}`;
  await prisma.order.update({ where: { id: order.id }, data: { rxcoreOrderId, status: "submitted" } });
  await audit({ action: "rxcore.order_opened", object: order.id, after: rxcoreOrderId });
  await emitOrderEvent(order.id, "order.received");
  return rxcoreOrderId;
}

/**
 * Re-submit an on-hold / missing-RxHere order to the Partner logistics API.
 * Used when RxHere was temporarily unavailable (e.g. Cloudflare 502) after KIAN already created the WT order.
 */
export async function retryRxHereSubmission(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { lines: true } });
  if (!order) return { ok: false as const, error: "Order not found." };
  if (order.rxhereOrderId?.trim()) {
    return { ok: true as const, orderId: order.rxhereOrderId, duplicate: true as const };
  }
  if (!rxhereConfigured()) {
    return { ok: false as const, error: "EVENTIDE_API_KEY / RXHERE_API_TOKEN is not configured." };
  }

  let patient: RxHerePatient | null = null;
  try {
    patient = order.patientJson ? (JSON.parse(order.patientJson) as RxHerePatient) : null;
  } catch {
    patient = null;
  }
  if (!patient?.firstName || !patient?.address?.line1) {
    return { ok: false as const, error: "Order is missing patient details needed for RxHere." };
  }

  let prescriber: RxHerePrescriber | undefined;
  try {
    const parsed = order.prescriberJson ? (JSON.parse(order.prescriberJson) as RxHerePrescriber) : undefined;
    if (parsed && (parsed.npiNumber || parsed.lastName || parsed.firstName)) prescriber = parsed;
  } catch {
    prescriber = undefined;
  }

  const products = await prisma.product.findMany({
    where: { sku: { in: order.lines.map((line) => line.sku) } },
    select: { sku: true, rxcoreFormularyId: true },
  });
  const formularyBySku = new Map(products.map((product) => [product.sku, product.rxcoreFormularyId]));
  const platformProductIdBySku = Object.fromEntries(
    order.lines
      .map((line) => {
        const sku = line.sku?.trim() || "";
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sku)) {
          return [sku, sku] as const;
        }
        const formularyId = formularyBySku.get(sku)?.trim() || "";
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(formularyId)) {
          return [sku, formularyId] as const;
        }
        return null;
      })
      .filter((entry): entry is readonly [string, string] => Boolean(entry)),
  );

  try {
    const rxhereOrderId = await openRxcoreOrder({
      orderId: order.id,
      lines: order.lines
        .filter((line) => isProductClass(line.productClass))
        .map((line) => ({
          productClass: line.productClass as ProductClass,
          patientInitials: line.patientInitials,
        })),
      prescription: {
        patient,
        prescriber,
        shippingMethod: order.shippingMethod === "OVERNIGHT" ? "OVERNIGHT" : "2_DAY",
        platformProductIdBySku,
      },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { splitMessage: "", status: "submitted" },
    });
    return { ok: true as const, orderId: rxhereOrderId, duplicate: false as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "RxHere resubmit failed.";
    return { ok: false as const, error: message };
  }
}

export async function createExternalOrder(input: { orgId: string; userId: string; sku: string; qty: number; source: string }) {
  const org = await prisma.organization.findUnique({ where: { id: input.orgId } });
  const product = await prisma.product.findUnique({ where: { sku: input.sku } });
  if (!org || !product || !isProductClass(product.productClass)) {
    return { error: "Unknown SKU." };
  }
  const gate = canOrder(org.verificationTier, product.productClass, product.orderable);
  if (!gate.ok) return { error: gate.reason };
  const count = await prisma.order.count();
  const shipping = shippingCents([product.storage]);
  const order = await prisma.order.create({
    data: {
      orgId: org.id,
      placedById: input.userId,
      invoiceNumber: `WT-2026-${String(count + 1).padStart(4, "0")}`,
      status: "submitted",
      paymentStatus: "terms",
      shippingFeeCents: shipping,
      subtotalCents: product.priceCents * input.qty,
      totalCents: product.priceCents * input.qty + shipping,
      source: input.source,
      lines: {
        create: {
          sku: product.sku,
          name: product.name,
          productClass: product.productClass,
          qty: input.qty,
          unitPriceCents: product.priceCents,
          routedSource: routeSource(product.productClass),
        },
      },
    },
  });
  const rxcoreOrderId = await openRxcoreOrder({
    orderId: order.id,
    lines: [{ productClass: product.productClass, patientInitials: "" }],
  });
  return { orderId: order.id, invoiceNumber: order.invoiceNumber, rxcoreOrderId };
}
