import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { ensurePharmacyNetwork } from "@/lib/ensure-pharmacies";
import { canOrder, commissionCents, isProductClass, routeSource, shippingCents, type ProductClass } from "@/lib/rules";
import { signWebhook, verifyWebhook } from "@/lib/crypto";
import {
  eventideConfigured,
  placePrescriptionOrder,
  resolveEventideFulfillmentPrescriber,
  type EventidePatient,
  type EventidePrescriber,
} from "@/lib/eventide";

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

function parsePatientJson(raw: string): EventidePatient | null {
  try {
    const parsed = raw ? (JSON.parse(raw) as EventidePatient) : null;
    if (!parsed?.firstName || !parsed?.address?.line1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parsePrescriberJson(raw: string): EventidePrescriber | undefined {
  try {
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    if (!parsed) return undefined;
    const npi = String(parsed.npiNumber || parsed.npi || "").replace(/\D/g, "") || undefined;
    const out: EventidePrescriber = {
      npiNumber: npi,
      firstName: String(parsed.firstName || "").trim() || undefined,
      lastName: String(parsed.lastName || "").trim() || undefined,
      title: String(parsed.title || "").trim() || undefined,
      practiceName: String(parsed.practiceName || parsed.displayName || "").trim() || undefined,
      phone: String(parsed.phone || "").trim() || undefined,
      licenseState: String(parsed.licenseState || "").trim() || undefined,
      licenseNumber: String(parsed.licenseNumber || "").trim() || undefined,
      deaNumber: String(parsed.deaNumber || parsed.dea || "").trim() || undefined,
    };
    if (out.npiNumber || out.lastName || out.firstName || out.deaNumber) return out;
    return undefined;
  } catch {
    return undefined;
  }
}

async function buildPatientFromOrder(order: {
  patientJson: string;
  clinicalPatientId: string | null;
  shipToJson: string;
}): Promise<EventidePatient | null> {
  const fromJson = parsePatientJson(order.patientJson);
  if (fromJson) return fromJson;
  if (!order.clinicalPatientId) return null;
  const patient = await prisma.clinicalPatient.findUnique({ where: { id: order.clinicalPatientId } });
  if (!patient) return null;
  let address = { line1: "", line2: "", city: "", state: "", zipCode: "", country: "US" };
  try {
    const addr = JSON.parse(patient.addressJson || "{}") as Record<string, string>;
    address = {
      line1: addr.line1 || addr.street1 || "",
      line2: addr.line2 || addr.street2 || "",
      city: addr.city || "",
      state: addr.state || "",
      zipCode: addr.zipCode || addr.zip || addr.postal_code || "",
      country: addr.country || "US",
    };
  } catch {
    /* keep empty */
  }
  if (!address.line1) {
    try {
      const ship = JSON.parse(order.shipToJson || "{}") as Record<string, string>;
      address = {
        line1: ship.street1 || ship.line1 || "",
        line2: ship.street2 || ship.line2 || "",
        city: ship.city || "",
        state: ship.state || "",
        zipCode: ship.zip || ship.postal_code || "",
        country: ship.country || "US",
      };
    } catch {
      /* keep empty */
    }
  }
  const parts = patient.fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] || "Patient",
    lastName: parts.slice(1).join(" ") || "Unknown",
    dateOfBirth: patient.dateOfBirth || "1990-01-01",
    gender: patient.gender || undefined,
    phone: patient.phone || undefined,
    email: patient.email || undefined,
    allergies: patient.allergies || undefined,
    address,
  };
}

export async function openRxcoreOrder(input: {
  orderId: string;
  lines: { productClass: ProductClass; patientInitials: string }[];
  /** Optional; when omitted, patient/prescriber are rebuilt from the order for Eventide. */
  prescription?: {
    patient: EventidePatient;
    prescriber?: EventidePrescriber;
    shippingMethod?: "2_DAY" | "OVERNIGHT";
    shippingDestinationType?: "patient_direct" | "practice_office" | "distributor_office";
    platformProductIdBySku?: Record<string, string>;
  };
}) {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { lines: true, placedBy: { include: { credential: true } } },
  });
  if (!order) return null;

  for (const line of input.lines) {
    await prisma.orderLine.updateMany({
      where: { orderId: input.orderId, productClass: line.productClass },
      data: { routedSource: routeSource(line.productClass) },
    });
  }

  const rxLines = order.lines.filter((line) => line.productClass === "503A" || line.productClass === "503B");
  if (eventideConfigured() && rxLines.length) {
    let prescription = input.prescription;
    if (!prescription?.patient) {
      const patient = await buildPatientFromOrder(order);
      if (patient) {
        prescription = {
          patient,
          shippingMethod: (order.shippingMethod as "2_DAY" | "OVERNIGHT") || "2_DAY",
        };
      }
    }

    if (prescription?.patient) {
      const shipDest =
        prescription.shippingDestinationType ||
        (order.shipDestination === "PRACTICE" || /office|practice/i.test(order.shipDestination || "")
          ? "practice_office"
          : "patient_direct");

      // Always prefer Eventide's own roster / prescriber-route physicians + their pharmacy network.
      const resolved = await resolveEventideFulfillmentPrescriber({
        state: prescription.patient.address.state,
      });
      if (!resolved.ok) {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "on_hold", splitMessage: resolved.error, placementError: resolved.error },
        });
        return null;
      }

      const override = prescription.prescriber;
      const prescriber: EventidePrescriber = {
        ...resolved.prescriber,
        // Explicit partner payload can fill gaps only; Eventide roster NPI/license win when present.
        npiNumber: resolved.prescriber.npiNumber || override?.npiNumber,
        licenseNumber: resolved.prescriber.licenseNumber || override?.licenseNumber,
        licenseState: resolved.prescriber.licenseState || override?.licenseState,
        deaNumber: resolved.prescriber.deaNumber || override?.deaNumber,
        firstName: resolved.prescriber.firstName || override?.firstName,
        lastName: resolved.prescriber.lastName || override?.lastName,
        practiceName: resolved.prescriber.practiceName || override?.practiceName,
      };

      const products = await prisma.product.findMany({
        where: { sku: { in: rxLines.map((line) => line.sku) } },
        select: { sku: true, rxcoreFormularyId: true },
      });
      const formularyBySku = new Map(products.map((p) => [p.sku, p.rxcoreFormularyId]));

      // Attach local Eventide pharmacy row for WT oversight; Eventide still routes compounding.
      const eventidePharmacy =
        (await prisma.pharmacy.findFirst({
          where: { name: { contains: "Eventide", mode: "insensitive" } },
        })) || (await ensurePharmacyNetwork().then((rows) => rows.find((p) => /eventide/i.test(p.name))));
      if (eventidePharmacy) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            pharmacyId: eventidePharmacy.id,
            prescriberJson: JSON.stringify({
              ...prescriber,
              eventideRoute: resolved.route,
              eventideReason: resolved.reason,
              eventidePrescriberId: resolved.prescriber.eventidePrescriberId,
            }),
          },
        });
      }

      const placed = await placePrescriptionOrder({
        partnerOrderId: order.partnerExternalRef || order.invoiceNumber,
        shippingMethod: prescription.shippingMethod || (order.shippingMethod as "2_DAY" | "OVERNIGHT") || "2_DAY",
        shippingDestinationType: shipDest,
        items: rxLines.map((line) => {
          const fromMap = prescription?.platformProductIdBySku?.[line.sku];
          const formulary = formularyBySku.get(line.sku);
          const platformProductId =
            fromMap ||
            (/^[0-9a-f-]{36}$/i.test(line.sku) ? line.sku : "") ||
            (formulary && /^[0-9a-f-]{36}$/i.test(formulary) ? formulary : "") ||
            undefined;
          return {
            sku: line.sku,
            platformProductId,
            name: line.name,
            strength: line.strength || undefined,
            size: line.size || undefined,
            dosageForm: line.dosageForm || undefined,
            quantity: line.qty,
            sig: line.sig || "As directed by prescribing clinician.",
          };
        }),
        patient: prescription.patient,
        prescriber,
      });
      if (!placed.ok) {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "on_hold", splitMessage: placed.error, placementError: placed.error },
        });
        return null;
      }
      const { pharmacyPaymentMessage } = await import("@/lib/eventide");
      const payNote = pharmacyPaymentMessage(placed.status);
      const sandboxNote =
        "sandbox" in placed && placed.sandbox
          ? " Eventide marked this order environment=sandbox — confirm live practice billing is activated."
          : "";
      const providerNote = ` Eventide provider ${prescriber.practiceName || [prescriber.firstName, prescriber.lastName].filter(Boolean).join(" ")} · pharmacy routing by Eventide.`;
      const nextStatus =
        String(placed.status || "").toLowerCase() === "awaiting_payment" ? "awaiting_payment" : "submitted";
      await prisma.order.update({
        where: { id: order.id },
        data: {
          rxcoreOrderId: placed.orderId,
          rxhereOrderId: placed.orderId,
          rxhereBatchId: placed.batchId || "",
          status: nextStatus,
          splitMessage: `${payNote}${sandboxNote}${providerNote}`.trim(),
          placementError: "",
        },
      });
      await audit({ action: "eventide.order_opened", object: order.id, after: placed.orderId });
      await emitOrderEvent(order.id, "order.received");
      if (nextStatus === "awaiting_payment") {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "awaiting_payment", splitMessage: `${payNote}${sandboxNote}${providerNote}`.trim() },
        });
      }
      return placed.orderId;
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "on_hold",
        placementError: "Missing patient details required to place with Eventide.",
        splitMessage: "Missing patient details required to place with Eventide.",
      },
    });
    return null;
  }

  // Eventide lines without a live API key must not look fulfilled in production.
  if (rxLines.length && (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production")) {
    if (process.env.ALLOW_SANDBOX_PHARMACY !== "1") {
      const message =
        "Eventide/VitaRelay API key is not configured in production. Set EVENTIDE_API_KEY or VITARELAY_API_KEY, then retry.";
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "on_hold", placementError: message, splitMessage: message },
      });
      return null;
    }
  }

  const rxcoreOrderId = `EVT-${randomBytes(4).toString("hex").toUpperCase()}`;
  await prisma.order.update({ where: { id: order.id }, data: { rxcoreOrderId, status: "submitted" } });
  await audit({ action: "eventide.order_opened_sandbox", object: order.id, after: rxcoreOrderId });
  await emitOrderEvent(order.id, "order.received");
  return rxcoreOrderId;
}

/** Re-submit an on-hold / missing-Eventide order to the Practice API. */
export async function retryEventideSubmission(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { lines: true } });
  if (!order) return { ok: false as const, error: "Order not found." };
  if (order.rxhereOrderId?.trim()) {
    return { ok: true as const, orderId: order.rxhereOrderId, duplicate: true as const };
  }
  if (!eventideConfigured()) {
    return { ok: false as const, error: "EVENTIDE_API_KEY / VITARELAY_API_KEY is not configured." };
  }

  let patient = parsePatientJson(order.patientJson);
  if (!patient) patient = await buildPatientFromOrder(order);
  if (!patient?.firstName || !patient?.address?.line1) {
    return { ok: false as const, error: "Order is missing patient details needed for Eventide." };
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
    const eventideOrderId = await openRxcoreOrder({
      orderId: order.id,
      lines: order.lines
        .filter((line) => isProductClass(line.productClass))
        .map((line) => ({
          productClass: line.productClass as ProductClass,
          patientInitials: line.patientInitials,
        })),
      prescription: {
        patient,
        shippingMethod: order.shippingMethod === "OVERNIGHT" ? "OVERNIGHT" : "2_DAY",
        platformProductIdBySku,
      },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { splitMessage: "", placementError: "", status: "submitted" },
    });
    return { ok: true as const, orderId: eventideOrderId, duplicate: false as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Eventide resubmit failed.";
    await prisma.order.update({
      where: { id: order.id },
      data: { placementError: message, splitMessage: message },
    });
    return { ok: false as const, error: message };
  }
}

/** @deprecated use retryEventideSubmission */
export const retryRxHereSubmission = retryEventideSubmission;

export async function createExternalOrder(input: { orgId: string; userId: string; sku: string; qty: number; source: string }) {
  const org = await prisma.organization.findUnique({ where: { id: input.orgId } });
  const product = await prisma.product.findUnique({ where: { sku: input.sku } });
  if (!org || !product || !isProductClass(product.productClass)) {
    return { error: "Unknown SKU." };
  }
  const gate = canOrder(org.verificationTier, product.productClass, product.orderable, {
    sku: product.sku,
    category: product.category,
    rxcoreFormularyId: product.rxcoreFormularyId,
  });
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
