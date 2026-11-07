import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { commissionCents, isProductClass, type ProductClass } from "@/lib/rules";
import { encryptField } from "@/lib/crypto";

export type EventideAddress = {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zipCode: string;
  country?: string;
};

export type EventidePatient = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender?: string;
  phone?: string;
  email?: string;
  allergies?: string;
  address: EventideAddress;
};

export type EventidePrescriber = {
  npiNumber?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  practiceName?: string;
  phone?: string;
  licenseState?: string;
  licenseNumber?: string;
};

export type EventideItem = {
  sku: string;
  platformProductId?: string;
  name?: string;
  strength?: string;
  size?: string;
  dosageForm?: string;
  quantity: number;
  sig: string;
};

export type PlacePrescriptionInput = {
  partnerOrderId: string;
  shippingMethod?: "2_DAY" | "OVERNIGHT";
  shippingDestinationType?: "patient_direct" | "practice_office" | "distributor_office";
  items: EventideItem[];
  patient: EventidePatient;
  prescriber?: EventidePrescriber;
  webhookUrl?: string;
};

/** @deprecated Use Eventide* types — kept for call-site compatibility during rename. */
export type RxHereAddress = EventideAddress;
export type RxHerePatient = EventidePatient;
export type RxHerePrescriber = EventidePrescriber;
export type RxHereItem = EventideItem;

const EVENT_STATUS: Record<string, string> = {
  COMPOUNDING: "compounding",
  QA_PENDING: "verified",
  SHIPPED: "shipped",
  IN_TRANSIT: "shipped",
  OUT_FOR_DELIVERY: "shipped",
  DELIVERED: "delivered",
  HOLD: "on_hold",
  EXCEPTION: "delayed",
  CANCELLED: "cancelled",
  PAID: "submitted",
  AWAITING_VERIFICATION: "received",
  paid: "submitted",
  shipped: "shipped",
  delivered: "delivered",
  cancelled: "cancelled",
  fulfilled: "compounding",
};

function baseUrl() {
  return (
    process.env.EVENTIDE_API_BASE_URL ||
    process.env.VITARELAY_PRACTICE_API_BASE_URL ||
    process.env.RXHERE_API_BASE_URL ||
    "https://vitarelay.com/api/public/practice/v1"
  ).replace(/\/$/, "");
}

function apiToken() {
  return (
    process.env.EVENTIDE_API_KEY?.trim() ||
    process.env.VITARELAY_API_KEY?.trim() ||
    process.env.RXHERE_API_TOKEN?.trim() ||
    process.env.RXHERE_API_KEY?.trim() ||
    ""
  );
}

export function eventideConfigured() {
  return Boolean(apiToken());
}

/** @deprecated */
export function rxhereConfigured() {
  return eventideConfigured();
}

function placedByUserId() {
  return (
    process.env.EVENTIDE_PLACED_BY_USER_ID?.trim() ||
    process.env.VITARELAY_PLACED_BY_USER_ID?.trim() ||
    ""
  );
}

export async function eventideFetch(path: string, init: RequestInit = {}) {
  const token = apiToken();
  if (!token) throw new Error("EVENTIDE_API_KEY is missing.");
  const url = `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  // Practice API stamps orders.placed_by_user_id from the key's linked user.
  // If the key has no linked user, pass Alen's portal user id explicitly.
  const placer = placedByUserId();
  if (placer && !headers.has("X-User-Id")) {
    headers.set("X-User-Id", placer);
  }
  const response = await fetch(url, { ...init, headers, cache: "no-store" });
  const text = await response.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { ok: response.ok, status: response.status, data };
}

/** @deprecated */
export async function rxhereFetch(path: string, init: RequestInit = {}) {
  return eventideFetch(path, init);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolvePlatformProductId(item: EventideItem): Promise<string | null> {
  if (item.platformProductId && isUuid(item.platformProductId)) return item.platformProductId.trim();
  if (item.sku && isUuid(item.sku)) return item.sku.trim();

  const query = (item.name || item.sku || "").trim();
  if (!query) return null;

  const result = await eventideFetch(`/catalog?limit=25&q=${encodeURIComponent(query.slice(0, 200))}`);
  if (!result.ok) return null;
  const rows = Array.isArray((result.data as { data?: unknown[] }).data)
    ? ((result.data as { data: Array<Record<string, unknown>> }).data)
    : [];
  if (!rows.length) return null;

  const want = normalizeName(item.name || item.sku);
  const strength = normalizeName(item.strength || "");
  const scored = rows
    .map((row) => {
      const id = String(row.id || "");
      const name = normalizeName(String(row.name || ""));
      let score = 0;
      if (name === want) score += 100;
      if (want && name.includes(want)) score += 40;
      if (want && want.includes(name)) score += 20;
      if (strength && name.includes(strength)) score += 25;
      if (item.sku && String(row.slug || "").toLowerCase().includes(item.sku.toLowerCase())) score += 15;
      return { id, score, name };
    })
    .filter((row) => row.id && isUuid(row.id))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.score ? scored[0].id : null;
}

export async function getShippingRates() {
  return eventideFetch("/catalog?limit=1");
}

export async function getOrderStatus(id: string) {
  return eventideFetch(`/orders/${encodeURIComponent(id)}`);
}

export async function cancelOrder(id: string) {
  return eventideFetch(`/orders/${encodeURIComponent(id)}/cancel`, { method: "POST", body: "{}" });
}

function errorMessage(data: unknown, status: number) {
  if (typeof data === "object" && data && "error" in data) {
    const err = (data as { error?: { message?: string; code?: string } | string }).error;
    if (typeof err === "string") return err;
    if (err?.message) return err.code ? `${err.message} (${err.code})` : err.message;
  }
  if (typeof data === "object" && data && "message" in data) {
    return String((data as { message?: string }).message);
  }
  return `Eventide order failed (${status}).`;
}

export async function placePrescriptionOrder(input: PlacePrescriptionInput) {
  if (!eventideConfigured()) {
    const sandboxId = `EVT-${randomBytes(4).toString("hex").toUpperCase()}`;
    return {
      ok: true as const,
      sandbox: true as const,
      orderId: sandboxId,
      orderIds: [sandboxId],
      partnerOrderId: input.partnerOrderId,
      batchId: "",
      status: "AWAITING_VERIFICATION",
    };
  }

  const resolved: Array<EventideItem & { platformProductId: string }> = [];
  for (const item of input.items) {
    const platformProductId = await resolvePlatformProductId(item);
    if (!platformProductId) {
      return {
        ok: false as const,
        status: 400,
        error: `No Eventide catalog match for ${item.name || item.sku}. Sync the formulary, then retry.`,
        data: { sku: item.sku, name: item.name },
      };
    }
    resolved.push({ ...item, platformProductId });
  }

  const defaultNpi = process.env.EVENTIDE_PRESCRIBER_NPI?.trim() || process.env.LAB_ORDERING_PHYSICIAN_NPI?.trim() || "";
  const npi = (input.prescriber?.npiNumber || defaultNpi).replace(/\D/g, "");
  if (!/^\d{10}$/.test(npi)) {
    return {
      ok: false as const,
      status: 400,
      error: "A valid 10-digit prescriber NPI is required for Eventide (set EVENTIDE_PRESCRIBER_NPI).",
      data: {},
    };
  }

  const licenseState =
    input.prescriber?.licenseState ||
    process.env.EVENTIDE_PRESCRIBER_LICENSE_STATE?.trim() ||
    input.patient.address.state ||
    "FL";
  const licenseNumber =
    input.prescriber?.licenseNumber ||
    process.env.EVENTIDE_PRESCRIBER_LICENSE_NUMBER?.trim() ||
    "";
  if (!licenseNumber) {
    return {
      ok: false as const,
      status: 400,
      error: "Prescriber license number is required for Eventide (set EVENTIDE_PRESCRIBER_LICENSE_NUMBER).",
      data: {},
    };
  }

  const fullName =
    [input.prescriber?.firstName, input.prescriber?.lastName].filter(Boolean).join(" ").trim() ||
    process.env.EVENTIDE_PRESCRIBER_NAME?.trim() ||
    "Licensed Prescriber";

  const dest =
    input.shippingDestinationType ||
    (input.shippingMethod === "OVERNIGHT" ? "patient_direct" : "patient_direct");

  const body = {
    external_order_id: input.partnerOrderId,
    shipping_destination_type: dest,
    patient: {
      first_name: input.patient.firstName,
      last_name: input.patient.lastName,
      dob: input.patient.dateOfBirth,
      email: input.patient.email || undefined,
      phone: input.patient.phone || undefined,
      external_patient_id: input.patient.email || undefined,
      address: {
        line1: input.patient.address.line1,
        line2: input.patient.address.line2 || undefined,
        city: input.patient.address.city,
        state: input.patient.address.state,
        postal_code: input.patient.address.zipCode,
      },
    },
    prescriptions: resolved.map((item) => ({
      platform_product_id: item.platformProductId,
      drug_name: item.name || item.sku,
      strength: item.strength || undefined,
      dosage_form: item.dosageForm || undefined,
      sig: item.sig || "As directed by prescribing clinician.",
      order_quantity: Math.max(1, Number(item.quantity) || 1),
      quantity: item.quantity,
      quantity_unit: item.size || undefined,
    })),
    shipping_address: {
      name: `${input.patient.firstName} ${input.patient.lastName}`.trim(),
      line1: input.patient.address.line1,
      line2: input.patient.address.line2 || undefined,
      city: input.patient.address.city,
      state: input.patient.address.state,
      postal_code: input.patient.address.zipCode,
      country: (input.patient.address.country || "US").slice(0, 2).toUpperCase(),
    },
    prescriber: {
      full_name: fullName,
      npi_number: npi,
      licenses: [{ state: licenseState, number: licenseNumber }],
    },
  };

  const result = await eventideFetch("/prescriptions", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!result.ok) {
    const raw = errorMessage(result.data, result.status);
    const placedByBroken = /placed_by_user_id/i.test(raw);
    return {
      ok: false as const,
      status: result.status,
      error: placedByBroken
        ? "Eventide rejected the order: API key is not linked to a portal user (placed_by_user_id). Ask Eventide/VitaRelay to reissue the Practice API key tied to your admin user, then retry. Portal checkout works meanwhile."
        : raw,
      data: result.data,
    };
  }

  const payload = result.data as {
    data?: {
      order_id?: string;
      order_number?: string;
      status?: string;
      idempotent_replay?: boolean;
    };
    order_id?: string;
    orderId?: string;
    status?: string;
  };
  const orderId =
    payload.data?.order_id ||
    payload.order_id ||
    payload.orderId ||
    "";

  return {
    ok: true as const,
    sandbox: false as const,
    orderId,
    orderIds: orderId ? [orderId] : [],
    partnerOrderId: input.partnerOrderId,
    batchId: payload.data?.order_number || "",
    status: payload.data?.status || payload.status || "AWAITING_VERIFICATION",
    data: result.data,
  };
}

export async function probeFormularyCatalog(): Promise<
  | {
      sku: string;
      name?: string;
      medication?: string;
      strength?: string;
      size?: string;
      form?: string;
      price?: number;
      category?: string;
      description?: string;
    }[]
  | null
> {
  if (!eventideConfigured()) return null;
  const all: Array<{
    sku: string;
    name?: string;
    medication?: string;
    strength?: string;
    size?: string;
    form?: string;
    price?: number;
    category?: string;
    description?: string;
  }> = [];

  for (let page = 1; page <= 30; page += 1) {
    const result = await eventideFetch(`/catalog?limit=100&page=${page}`);
    if (!result.ok) break;
    const rows = Array.isArray((result.data as { data?: unknown[] }).data)
      ? ((result.data as { data: Array<Record<string, unknown>> }).data)
      : [];
    if (!rows.length) break;
    for (const item of rows) {
      const id = String(item.id || "").trim();
      if (!id) continue;
      all.push({
        sku: id,
        name: item.name ? String(item.name) : undefined,
        strength: Array.isArray(item.strengths) ? String(item.strengths[0] || "") : undefined,
        form: item.dosage_form ? String(item.dosage_form) : undefined,
        price: typeof item.price_cents === "number" ? item.price_cents / 100 : undefined,
        category: item.category ? String(item.category) : undefined,
        description: item.description ? String(item.description) : undefined,
      });
    }
    if (rows.length < 100) break;
  }
  return all.length ? all : null;
}

function timingSafeEqualString(a: string, b: string) {
  try {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function hmacHex(secret: string | Buffer, payload: string) {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

function hmacBase64(secret: string | Buffer, payload: string) {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64");
}

export function verifyRxHereWebhookSecret(request: Request, rawBody?: string) {
  const expected =
    process.env.EVENTIDE_WEBHOOK_SECRET?.trim() ||
    process.env.VITARELAY_WEBHOOK_SECRET?.trim() ||
    process.env.RXHERE_WEBHOOK_SECRET?.trim();
  if (!expected) return false;

  // Shared-secret header style (legacy)
  const a = request.headers.get("x-webhook-secret") || "";
  const b = request.headers.get("x-courier-secret") || "";
  const c = request.headers.get("x-eventide-secret") || "";
  if (a === expected || b === expected || c === expected) return true;

  // VitaRelay / Eventide HMAC signature over raw body
  const sigHeader =
    request.headers.get("x-vitarelay-signature") ||
    request.headers.get("x-webhook-signature") ||
    request.headers.get("x-eventide-signature") ||
    "";
  if (!sigHeader || rawBody == null) return false;

  const received = sigHeader.replace(/^sha256=/i, "").replace(/^v1=/i, "").trim();
  const keys: Array<string | Buffer> = [expected];
  if (expected.startsWith("whsec_")) {
    const rest = expected.slice("whsec_".length);
    keys.push(rest);
    try {
      keys.push(Buffer.from(rest, "base64"));
    } catch {
      // ignore
    }
  }
  const timestamp =
    request.headers.get("x-vitarelay-timestamp") ||
    request.headers.get("x-webhook-timestamp") ||
    "";
  const payloads = [rawBody];
  if (timestamp.trim()) payloads.push(`${timestamp.trim()}.${rawBody}`);

  for (const key of keys) {
    for (const payload of payloads) {
      const digestHex = hmacHex(key, payload);
      const digestB64 = hmacBase64(key, payload);
      if (timingSafeEqualString(digestHex, received) || timingSafeEqualString(digestB64, received)) {
        return true;
      }
      if (sigHeader.includes(digestHex) || sigHeader.includes(digestB64)) return true;
    }
  }
  return false;
}

export function packPatient(patient: EventidePatient) {
  const json = JSON.stringify(patient);
  return { patientJson: json, patientCipher: encryptField(json) };
}

/** Push fulfillment status + tracking back to KIAN (partner webhook). */
export async function notifyKianStatus(payload: {
  externalRef: string;
  status: string;
  trackingNumber?: string;
  carrier?: string;
  event: string;
  occurredAt?: string;
  reason?: string;
}) {
  const url = process.env.KIAN_STATUS_WEBHOOK_URL?.trim();
  const secret = process.env.KIAN_PARTNER_SECRET?.trim();
  if (!url || !secret || !payload.externalRef) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wt-partner-secret": secret,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    // Status callbacks are best-effort.
  }
}

export async function ingestRxHereWebhook(body: string, request: Request) {
  if (!verifyRxHereWebhookSecret(request, body)) {
    return { ok: false as const, status: 401, error: "Invalid webhook secret." };
  }
  const payload = JSON.parse(body) as {
    reference?: string;
    logisticsReference?: string;
    event?: string;
    trackingNumber?: string | null;
    carrier?: string | null;
    description?: string;
    reason?: string | null;
    occurredAt?: string;
    type?: string;
    data?: {
      order_id?: string;
      reference?: string;
      tracking_number?: string;
      tracking_carrier?: string;
    };
  };

  const event = payload.event || payload.type || "";
  const reference =
    payload.reference ||
    payload.data?.reference ||
    payload.data?.order_id ||
    payload.logisticsReference ||
    "";
  if (!reference || !event) {
    return { ok: false as const, status: 400, error: "Missing reference or event." };
  }

  const eventId = createHash("sha256")
    .update(`${reference}|${event}|${payload.occurredAt || ""}`)
    .digest("hex");
  const duplicate = await prisma.orderEvent.findUnique({ where: { eventId } });
  if (duplicate) return { ok: true as const, duplicate: true };

  const order =
    (await prisma.order.findFirst({
      where: { partnerExternalRef: reference },
      include: { lines: true, org: true },
    })) ||
    (await prisma.order.findFirst({
      where: { invoiceNumber: reference },
      include: { lines: true, org: true },
    })) ||
    (await prisma.order.findFirst({
      where: { OR: [{ rxhereOrderId: reference }, { rxcoreOrderId: reference }] },
      include: { lines: true, org: true },
    }));

  if (!order) return { ok: false as const, status: 404, error: "Order not found." };

  const status = EVENT_STATUS[event] || EVENT_STATUS[event.replace(/^order\./, "")] || order.status;
  await prisma.orderEvent.create({
    data: { orderId: order.id, eventId, type: event, payload: body },
  });
  await prisma.webhookDelivery.create({
    data: { eventId, type: event, payload: body, status: "delivered" },
  });
  await prisma.order.update({
    where: { id: order.id },
    data: {
      status,
      trackingNumber: payload.trackingNumber || payload.data?.tracking_number || order.trackingNumber,
      rxhereOrderId: payload.logisticsReference || payload.data?.order_id || order.rxhereOrderId,
    },
  });
  await prisma.orderLine.updateMany({ where: { orderId: order.id }, data: { lineStatus: status } });

  if ((event === "DELIVERED" || event === "order.delivered") && order.org.referringAffiliateId) {
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
        const existing = await prisma.commission.findFirst({ where: { orderId: order.id, affiliateUserId: affiliate.userId } });
        if (!existing) {
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
  }

  await audit({
    action: "eventide.webhook",
    object: order.id,
    after: `${event}:${status}`,
  });

  await notifyKianStatus({
    externalRef: order.partnerExternalRef || order.invoiceNumber,
    status,
    trackingNumber: payload.trackingNumber || payload.data?.tracking_number || undefined,
    carrier: payload.carrier || payload.data?.tracking_carrier || undefined,
    event,
    occurredAt: payload.occurredAt,
    reason: payload.reason || undefined,
  });

  return { ok: true as const, duplicate: false, status };
}
