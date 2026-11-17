import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { ensurePharmacyNetwork } from "@/lib/ensure-pharmacies";
import {
  canOrder,
  commissionCents,
  isEventidePlacementClass,
  isProductClass,
  isSandboxPharmacyOrderId,
  routeSource,
  shippingCents,
  type ProductClass,
} from "@/lib/rules";
import { signWebhook, verifyWebhook } from "@/lib/crypto";
import {
  eventideConfigured,
  placePrescriptionOrder,
  requestEventideNetworkScript,
  resolveEventideIssuePlan,
  type EventidePatient,
  type EventidePrescriber,
  type EventideReferringProvider,
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
  /** Optional; when omitted, patient is rebuilt from the order. Issuing clinician always comes from Eventide. */
  prescription?: {
    patient: EventidePatient;
    /** Ignored for VitaRelay issuance — kept only for audit/referring context. */
    prescriber?: EventidePrescriber;
    referringProvider?: EventideReferringProvider;
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

  // 503A/503B + RND (Eventide R&D / RUO catalog) all place through VitaRelay Practice API.
  const rxLines = order.lines.filter((line) => isEventidePlacementClass(line.productClass));
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

      // Eventide physicians issue the Rx; KIAN/WT clinicians are referring only.
      const plan = await resolveEventideIssuePlan({
        state: prescription.patient.address.state,
      });
      if (!plan.ok) {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "on_hold", splitMessage: plan.error, placementError: plan.error },
        });
        return null;
      }

      const products = await prisma.product.findMany({
        where: { sku: { in: rxLines.map((line) => line.sku) } },
        select: { sku: true, rxcoreFormularyId: true },
      });
      const formularyBySku = new Map(products.map((p) => [p.sku, p.rxcoreFormularyId]));
      const platformIds = rxLines
        .map((line) => {
          const fromMap = prescription?.platformProductIdBySku?.[line.sku];
          const formulary = formularyBySku.get(line.sku);
          return (
            fromMap ||
            (/^[0-9a-f-]{36}$/i.test(line.sku) ? line.sku : "") ||
            (formulary && /^[0-9a-f-]{36}$/i.test(formulary) ? formulary : "") ||
            ""
          );
        })
        .filter(Boolean);

      const eventidePharmacy =
        (await prisma.pharmacy.findFirst({
          where: { name: { contains: "Eventide", mode: "insensitive" } },
        })) || (await ensurePharmacyNetwork().then((rows) => rows.find((p) => /eventide/i.test(p.name))));

      const referring =
        prescription.referringProvider ||
        ({
          externalId: order.source || "kian-prive",
          name: order.source || "Referring clinic",
          kind: "tele_clinic" as const,
        } satisfies EventideReferringProvider);

      let prescriber = plan.mode === "own" ? plan.prescriber : undefined;
      let placementMode: "own" | "network" | "own_multistate" = plan.mode === "own" ? "own" : "network";

      if (plan.mode === "network") {
        const requested = await requestEventideNetworkScript({
          partnerOrderId: order.partnerExternalRef || order.invoiceNumber,
          patient: prescription.patient,
          platformProductIds: platformIds,
          referringProvider: referring,
          note: [
            `Partner order ${order.partnerExternalRef || order.invoiceNumber}`,
            `Referring clinic: ${referring.name}`,
            "Please issue under Eventide network prescriber; pharmacy fulfillment by Eventide.",
          ].join("\n"),
        });
        if (requested.ok) {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              status: "awaiting_prescription",
              escriptStatus: "pending_eventide_network",
              pharmacyId: eventidePharmacy?.id || undefined,
              rxcoreOrderId: requested.requestId,
              rxhereOrderId: requested.requestId,
              placementError: "",
              splitMessage: `Waiting for Eventide doctor network to issue/sign the prescription (script request ${requested.requestId || "pending"}). Pharmacy fills after they sign.`,
              prescriberJson: JSON.stringify({
                mode: "network",
                eventideRoute: plan.route,
                eventideReason: plan.reason,
                scriptRequestId: requested.requestId,
                scriptRequestIds: requested.requestIds,
                referring,
                partnerPrescriberIgnored: prescription.prescriber || null,
              }),
            },
          });
          await audit({
            action: "eventide.script_requested",
            object: order.id,
            after: requested.requestId || "pending",
          });
          return requested.requestId || null;
        }

        // Practice key is not a distributor yet — place under Eventide's own MD with
        // multi-state licenses on POST /prescriptions (patient state + home FL license).
        const homeState = (process.env.EVENTIDE_PRESCRIBER_LICENSE_STATE || "FL").trim().toUpperCase().slice(0, 2);
        const ownFallback = await resolveEventideIssuePlan({ state: homeState });
        if (!ownFallback.ok || ownFallback.mode !== "own" || !ownFallback.prescriber) {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              status: "on_hold",
              escriptStatus: "pending_eventide_network",
              pharmacyId: eventidePharmacy?.id || undefined,
              placementError: requested.error,
              splitMessage: requested.error,
              prescriberJson: JSON.stringify({
                mode: "network",
                eventideRoute: plan.route,
                eventideReason: plan.reason,
                referring,
                partnerPrescriberIgnored: prescription.prescriber || null,
              }),
            },
          });
          return null;
        }
        prescriber = ownFallback.prescriber;
        placementMode = "own_multistate";
        await audit({
          action: "eventide.network_fallback_own_multistate",
          object: order.id,
          after: requested.error,
        });
      }

      if (!prescriber) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "on_hold",
            placementError: "No Eventide issuing physician available for this patient state.",
            splitMessage: "No Eventide issuing physician available for this patient state.",
          },
        });
        return null;
      }
      if (eventidePharmacy) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            pharmacyId: eventidePharmacy.id,
            escriptStatus: "issued_by_eventide",
            prescriberJson: JSON.stringify({
              ...prescriber,
              mode: placementMode,
              eventideRoute: plan.route,
              eventideReason: plan.reason,
              eventidePrescriberId: prescriber.eventidePrescriberId,
              referring,
              partnerPrescriberIgnored: prescription.prescriber || null,
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
            sig: line.sig || "As directed by Eventide prescribing clinician.",
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
      const providerNote = ` Issued under Eventide prescriber ${prescriber.practiceName || [prescriber.firstName, prescriber.lastName].filter(Boolean).join(" ")} (NPI ${prescriber.npiNumber || "—"}) · pharmacy routing by Eventide.`;
      const nextStatus =
        String(placed.status || "").toLowerCase() === "awaiting_payment" ? "awaiting_payment" : "submitted";
      const vrPatientId = "patientId" in placed && placed.patientId ? String(placed.patientId) : "";
      await prisma.order.update({
        where: { id: order.id },
        data: {
          rxcoreOrderId: placed.orderId,
          rxhereOrderId: placed.orderId,
          rxhereBatchId: placed.batchId || "",
          status: nextStatus,
          escriptStatus: "issued_by_eventide",
          splitMessage: `${payNote}${sandboxNote}${providerNote}`.trim(),
          placementError: "",
          ...(vrPatientId
            ? {
                notes: [order.notes, `eventide_patient_id=${vrPatientId}`]
                  .filter(Boolean)
                  .join("\n")
                  .slice(0, 2000),
              }
            : {}),
        },
      });
      if (vrPatientId) {
        await prisma.orderLine.updateMany({
          where: { orderId: order.id },
          data: { rxcorePatientId: vrPatientId },
        });
      }
      await audit({ action: "eventide.order_opened", object: order.id, after: placed.orderId });
      // Do not emit order.received — that would overwrite awaiting_payment/submitted with "received".
      await prisma.orderEvent.create({
        data: {
          orderId: order.id,
          eventId: `evt_place_${randomBytes(8).toString("hex")}`,
          type: "eventide.placed",
          payload: JSON.stringify({
            orderId: placed.orderId,
            status: nextStatus,
            at: new Date().toISOString(),
          }),
        },
      });
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

  // Eventide-class lines without a live API key must not look fulfilled in production.
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

  // Local/dev only: invent EVT-* when pharmacy sandbox is explicitly allowed.
  // Never mint these when Eventide is configured — that masked RND skips as "placed".
  if (rxLines.length && !eventideConfigured() && process.env.ALLOW_SANDBOX_PHARMACY === "1") {
    const rxcoreOrderId = `EVT-${randomBytes(4).toString("hex").toUpperCase()}`;
    await prisma.order.update({
      where: { id: order.id },
      data: {
        rxcoreOrderId,
        status: "submitted",
        splitMessage: "Sandbox pharmacy id (ALLOW_SANDBOX_PHARMACY) — not on VitaRelay.",
      },
    });
    await audit({ action: "eventide.order_opened_sandbox", object: order.id, after: rxcoreOrderId });
    await emitOrderEvent(order.id, "order.received");
    return rxcoreOrderId;
  }

  if (rxLines.length) {
    const message =
      "Could not place Eventide/VitaRelay lines (API not configured or patient missing). Order held.";
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "on_hold", placementError: message, splitMessage: message },
    });
    return null;
  }

  // Non-pharmacy lines (devices/supplies) — no VitaRelay order id.
  await prisma.order.update({
    where: { id: order.id },
    data: { status: order.status === "submitted" ? "received" : order.status },
  });
  await emitOrderEvent(order.id, "order.received");
  return null;
}

/** Re-submit an on-hold / missing-Eventide order to the Practice API. */
export async function retryEventideSubmission(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { lines: true } });
  if (!order) return { ok: false as const, error: "Order not found." };
  const liveRemoteId = [order.rxhereOrderId, order.rxcoreOrderId].find(
    (id) => id?.trim() && !isSandboxPharmacyOrderId(id),
  );
  const alreadyPlaced =
    liveRemoteId &&
    order.escriptStatus !== "pending_eventide_network" &&
    order.status !== "awaiting_prescription" &&
    order.status !== "on_hold";
  if (alreadyPlaced) {
    return { ok: true as const, orderId: liveRemoteId, duplicate: true as const };
  }
  if (!eventideConfigured()) {
    return { ok: false as const, error: "EVENTIDE_API_KEY / VITARELAY_API_KEY is not configured." };
  }

  let patient = parsePatientJson(order.patientJson);
  if (!patient) patient = await buildPatientFromOrder(order);
  if (!patient?.firstName || !patient?.address?.line1) {
    return { ok: false as const, error: "Order is missing patient details needed for Eventide." };
  }

  // Clear fake EVT-* so a retry can store the real VitaRelay id.
  if (isSandboxPharmacyOrderId(order.rxcoreOrderId) || isSandboxPharmacyOrderId(order.rxhereOrderId)) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        rxcoreOrderId: "",
        rxhereOrderId: "",
        status: "on_hold",
        placementError: "Retrying VitaRelay placement (previous id was local sandbox).",
        splitMessage: "Retrying VitaRelay placement…",
      },
    });
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
        shippingDestinationType:
          order.shipDestination === "PRACTICE" || /office|practice/i.test(order.shipDestination || "")
            ? "practice_office"
            : "patient_direct",
        platformProductIdBySku,
      },
    });
    if (!eventideOrderId || isSandboxPharmacyOrderId(eventideOrderId)) {
      const refreshed = await prisma.order.findUnique({ where: { id: order.id } });
      return {
        ok: false as const,
        error: refreshed?.placementError || "VitaRelay placement did not return a live order id.",
      };
    }
    return { ok: true as const, orderId: eventideOrderId, duplicate: false as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Eventide resubmit failed.";
    await prisma.order.update({
      where: { id: order.id },
      data: { placementError: message, splitMessage: message, status: "on_hold" },
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
