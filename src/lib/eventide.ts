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
  /** Required by VitaRelay when any line is a controlled substance. */
  deaNumber?: string;
  /** VitaRelay roster id when resolved from Eventide `/prescribers`. */
  eventidePrescriberId?: string;
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
  INVOICED: "submitted",
  FULFILLED: "compounding",
  AWAITING_VERIFICATION: "received",
  // Practice still owes VitaRelay — do not look "compounding" yet.
  awaiting_payment: "awaiting_payment",
  AWAITING_PAYMENT: "awaiting_payment",
  submitted: "submitted",
  processing: "compounding",
  ready_to_ship: "verified",
  paid: "submitted",
  invoiced: "submitted",
  shipped: "shipped",
  delivered: "delivered",
  cancelled: "cancelled",
  canceled: "cancelled",
  fulfilled: "compounding",
  exception: "delayed",
  "order.paid": "submitted",
  "order.invoiced": "submitted",
  "order.awaiting_payment": "awaiting_payment",
  "order.fulfilled": "compounding",
  "order.shipped": "shipped",
  "order.delivered": "delivered",
  "order.exception": "delayed",
  "order.cancelled": "cancelled",
  "order.canceled": "cancelled",
};

export function pharmacyPaymentMessage(status: string | null | undefined, paymentMessage?: string | null) {
  const explicit = String(paymentMessage || "").trim();
  if (explicit) return explicit;
  const s = String(status || "").toLowerCase();
  if (s === "awaiting_payment") {
    return "VitaRelay order created — awaiting practice payment on the VitaRelay/Eventide account (card on file). Compounding starts after that clears.";
  }
  return "";
}

function baseUrl() {
  // Eventide / VitaRelay Practice API only — RxHere is not used.
  return (
    process.env.EVENTIDE_API_BASE_URL ||
    process.env.VITARELAY_PRACTICE_API_BASE_URL ||
    "https://vitarelay.com/api/public/practice/v1"
  ).replace(/\/$/, "");
}

function apiToken() {
  return process.env.EVENTIDE_API_KEY?.trim() || process.env.VITARELAY_API_KEY?.trim() || "";
}

export function eventideConfigured() {
  return Boolean(apiToken());
}

const EVENTIDE_CDN = {
  powder:
    "https://vitarelay.com/__l5e/assets-v1/0cffe580-da37-48f8-b0d1-5a07027e056b/lyophilized-powder.png",
  pen: "https://vitarelay.com/__l5e/assets-v1/7a5eff76-3f46-4d87-8a50-de34ef7f27ff/injection-pen.png",
  serum: "https://vitarelay.com/__l5e/assets-v1/93425fa8-8402-43ab-ba6b-edf2329a9d39/serum-bottle.png",
} as const;

/** Resolve Eventide/VitaRelay CDN asset paths to absolute https URLs (live CDN). */
export function absoluteEventideAsset(pathOrUrl?: string | null) {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) return "";
  if (raw.includes("injection-pen") || raw.endsWith("/injection-pen.png")) return EVENTIDE_CDN.pen;
  if (raw.includes("serum-bottle") || raw.endsWith("/serum-bottle.png")) return EVENTIDE_CDN.serum;
  if (raw.includes("lyophilized-powder") || raw.endsWith("/lyophilized-powder.png")) return EVENTIDE_CDN.powder;
  if (/^https?:\/\//i.test(raw)) return raw;
  const host = (process.env.VITARELAY_ASSET_BASE_URL || "https://vitarelay.com").replace(/\/$/, "");
  return `${host}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

/** Eventide CDN product photo when API has no image_urls. */
export function eventideFallbackImage(input: { name?: string; form?: string; category?: string }) {
  const blob = `${input.name || ""} ${input.form || ""} ${input.category || ""}`.toLowerCase();
  if (/prescribeusa|pre-filled|\bpen\b/.test(blob)) return EVENTIDE_CDN.pen;
  if (/serum|topical|cream|gel|lotion|drop|supply|syringe/.test(blob)) return EVENTIDE_CDN.serum;
  return EVENTIDE_CDN.powder;
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

  // Prefer a formulary UUID already stamped on our product row.
  if (item.sku) {
    const local = await prisma.product.findFirst({
      where: {
        OR: [{ sku: item.sku }, { rxcoreFormularyId: item.sku }],
      },
      select: { sku: true, rxcoreFormularyId: true },
    });
    if (local?.rxcoreFormularyId && isUuid(local.rxcoreFormularyId)) return local.rxcoreFormularyId;
    if (local?.sku && isUuid(local.sku)) return local.sku;
  }

  const query = (item.name || item.sku || "").trim();
  if (!query) return null;

  // Try short medication token first (FOXO4 → FOX) then full name.
  const token = query.split(/[\s(/·|]+/).filter(Boolean)[0] || query;
  const searches = Array.from(new Set([token.slice(0, 40), query.slice(0, 120)]));
  const rows: Array<Record<string, unknown>> = [];
  for (const q of searches) {
    const result = await eventideFetch(`/catalog?limit=50&q=${encodeURIComponent(q)}`);
    if (!result.ok) continue;
    const batch = Array.isArray((result.data as { data?: unknown[] }).data)
      ? ((result.data as { data: Array<Record<string, unknown>> }).data)
      : [];
    rows.push(...batch);
  }
  if (!rows.length) return null;

  const want = normalizeName(item.name || item.sku).replace(/foxo?\s*0?4/g, "fox 04");
  const strength = normalizeName(item.strength || "");
  const scored = rows
    .map((row) => {
      const id = String(row.id || "");
      const name = normalizeName(String(row.name || "")).replace(/foxo?\s*0?4/g, "fox 04");
      let score = 0;
      if (name === want) score += 100;
      if (want && name.includes(want)) score += 40;
      if (want && want.includes(name)) score += 20;
      if (strength && name.includes(strength)) score += 25;
      if (item.sku && String(row.slug || "").toLowerCase().includes(item.sku.toLowerCase())) score += 15;
      // Token overlap for legacy ↔ VR naming (FOXO4 vs FOX-04 DRI)
      const wantParts = new Set(want.split(" ").filter((p) => p.length > 2));
      for (const part of name.split(" ")) {
        if (wantParts.has(part)) score += 10;
      }
      return { id, score, name };
    })
    .filter((row) => row.id && isUuid(row.id))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.score && scored[0].score >= 40 ? scored[0].id : null;
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

/** VitaRelay expects E.164 when a phone is sent (e.g. +13055550188). */
export function normalizeUsPhoneE164(value?: string | null): string | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.startsWith("+") && digits.length >= 10) return `+${digits}`;
  return undefined;
}

function normalizeShippingDestination(
  value?: PlacePrescriptionInput["shippingDestinationType"] | string | null,
): "patient_direct" | "practice_office" | "distributor_office" {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (
    raw === "practice" ||
    raw === "practice_office" ||
    raw === "office" ||
    raw === "office_stock" ||
    raw === "provider_clinic" ||
    raw === "clinic"
  ) {
    return "practice_office";
  }
  if (raw === "distributor" || raw === "distributor_office" || raw === "wt_office") {
    return "distributor_office";
  }
  return "patient_direct";
}

export type VitaRelayPrescriberRoster = {
  id?: string;
  full_name?: string;
  npi_number?: string;
  license_state?: string;
  license_number?: string;
  role?: string;
  npi_verified?: boolean;
  has_dea?: boolean;
  dea_last2?: string;
};

export async function listPrescribers() {
  return eventideFetch("/prescribers");
}

export async function upsertPrescriber(input: {
  fullName: string;
  npiNumber: string;
  deaNumber?: string;
  licenseState: string;
  licenseNumber: string;
  role?: string;
}) {
  const npi = input.npiNumber.replace(/\D/g, "");
  if (!/^\d{10}$/.test(npi)) {
    return { ok: false as const, status: 400, error: "NPI must be 10 digits.", data: {} };
  }
  const body: Record<string, string> = {
    full_name: input.fullName.trim(),
    npi_number: npi,
    license_state: input.licenseState.trim().toUpperCase().slice(0, 2),
    license_number: input.licenseNumber.trim(),
    role: input.role || "provider",
  };
  if (input.deaNumber?.trim()) body.dea_number = input.deaNumber.trim().toUpperCase();
  const result = await eventideFetch("/prescribers", { method: "POST", body: JSON.stringify(body) });
  if (!result.ok) {
    return { ok: false as const, status: result.status, error: errorMessage(result.data, result.status), data: result.data };
  }
  return { ok: true as const, status: result.status, data: result.data };
}

/** Sync a local credentialed user onto the VitaRelay practice roster. */
export async function syncPrescriberToVitaRelay(userId: string) {
  if (!eventideConfigured()) return { ok: false as const, error: "VitaRelay API key not configured." };
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { credential: true } });
  if (!user?.credential?.npi) return { ok: false as const, error: "User has no NPI credential." };
  let dea = "";
  try {
    const { decryptField } = await import("@/lib/crypto");
    const cipher = user.credential.deaCipher || "";
    if (cipher) {
      // Accept either encrypted packs or legacy plaintext during migration.
      dea = cipher.includes(":") ? decryptField(cipher) || "" : cipher;
    }
  } catch {
    dea = user.credential.deaCipher || "";
  }
  let licenses: Array<{ state: string; licenseNumber: string }> = [];
  try {
    licenses = JSON.parse(user.credential.licensesJson || "[]") as Array<{ state: string; licenseNumber: string }>;
  } catch {
    licenses = [];
  }
  const primary = licenses[0];
  const licenseState =
    primary?.state ||
    process.env.EVENTIDE_PRESCRIBER_LICENSE_STATE?.trim() ||
    "";
  const licenseNumber =
    primary?.licenseNumber ||
    process.env.EVENTIDE_PRESCRIBER_LICENSE_NUMBER?.trim() ||
    "";
  if (!licenseState || !licenseNumber) {
    return { ok: false as const, error: "Prescriber license state/number required before roster sync." };
  }
  return upsertPrescriber({
    fullName: user.credential.displayName || user.name,
    npiNumber: user.credential.npi,
    deaNumber: dea || undefined,
    licenseState,
    licenseNumber,
  });
}

export async function getCatalogProduct(idOrSlug: string) {
  return eventideFetch(`/catalog/${encodeURIComponent(idOrSlug)}`);
}

export async function getPrescriberRoute(params: { state?: string; patientId?: string }) {
  const q = new URLSearchParams();
  if (params.state) q.set("state", params.state);
  if (params.patientId) q.set("patient_id", params.patientId);
  return eventideFetch(`/prescriber-route?${q.toString()}`);
}

export type EventideIssuePlan =
  | {
      ok: true;
      mode: "own";
      route: string;
      reason: string;
      state: string;
      prescriber: EventidePrescriber & { eventidePrescriberId?: string };
    }
  | {
      ok: true;
      mode: "network";
      route: string;
      reason: string;
      state: string;
    }
  | { ok: false; error: string };

/**
 * Decide who issues the Rx on Eventide:
 * - `own` → Eventide roster physician licensed in the patient state (e.g. Carmen / FL)
 * - `network` → Eventide doctor network must sign via POST /script-requests, then we order with escript_ids
 *
 * KIAN / WT clinicians are never the VitaRelay prescriber of record.
 */
export async function resolveEventideIssuePlan(input?: {
  state?: string | null;
  patientId?: string | null;
}): Promise<EventideIssuePlan> {
  if (!eventideConfigured()) {
    return { ok: false, error: "EVENTIDE_API_KEY / VITARELAY_API_KEY is not configured." };
  }

  const state = String(input?.state || "")
    .trim()
    .toUpperCase()
    .slice(0, 2);

  const [routeResult, rosterResult] = await Promise.all([
    state || input?.patientId
      ? getPrescriberRoute({ state: state || undefined, patientId: input?.patientId || undefined })
      : Promise.resolve({ ok: false as const, status: 0, data: {} }),
    listPrescribers(),
  ]);

  const rosterRows = Array.isArray((rosterResult.data as { data?: unknown[] })?.data)
    ? ((rosterResult.data as { data: VitaRelayPrescriberRoster[] }).data)
    : Array.isArray(rosterResult.data)
      ? (rosterResult.data as VitaRelayPrescriberRoster[])
      : [];

  const routeData =
    routeResult.ok && typeof routeResult.data === "object" && routeResult.data
      ? ((routeResult.data as { data?: Record<string, unknown> }).data || (routeResult.data as Record<string, unknown>))
      : null;

  const route = String(routeData?.route || "").toLowerCase();
  const reason = String(routeData?.reason || "");

  if (route === "network") {
    return {
      ok: true,
      mode: "network",
      route,
      reason: reason || "network_no_own_prescriber_in_state",
      state,
    };
  }

  const assignedId = String(
    routeData?.assigned_prescriber_id ||
      (routeData?.prescriber && typeof routeData.prescriber === "object"
        ? (routeData.prescriber as { id?: string }).id
        : "") ||
      "",
  ).trim();

  // Only use the Eventide physician that VitaRelay assigned for this state — never a random roster row.
  let picked = assignedId ? rosterRows.find((row) => row.id === assignedId) : undefined;
  if (!picked && route === "own" && state) {
    picked = rosterRows.find(
      (row) =>
        String(row.license_state || "")
          .toUpperCase()
          .slice(0, 2) === state && row.npi_number,
    );
  }

  if (!picked) {
    const envNpi = (process.env.EVENTIDE_PRESCRIBER_NPI || process.env.VITARELAY_PRESCRIBER_NPI || "").replace(/\D/g, "");
    const envLicense = process.env.EVENTIDE_PRESCRIBER_LICENSE_NUMBER?.trim() || "";
    const envState = (process.env.EVENTIDE_PRESCRIBER_LICENSE_STATE || "").trim().toUpperCase().slice(0, 2);
    const envName = process.env.EVENTIDE_PRESCRIBER_NAME?.trim() || "";
    if (/^\d{10}$/.test(envNpi) && envLicense && envState && (!state || envState === state)) {
      return {
        ok: true,
        mode: "own",
        route: route || "env_fallback",
        reason: reason || "eventide_roster_empty",
        state: state || envState,
        prescriber: {
          npiNumber: envNpi,
          licenseNumber: envLicense,
          licenseState: envState,
          firstName: envName.split(/\s+/)[0] || "Licensed",
          lastName: envName.split(/\s+/).slice(1).join(" ") || "Prescriber",
          practiceName: envName || "Eventide",
          deaNumber: process.env.EVENTIDE_PRESCRIBER_DEA?.trim() || process.env.VITARELAY_PRESCRIBER_DEA?.trim() || undefined,
        },
      };
    }
    if (!state) {
      return {
        ok: false,
        error: "Patient state is required so Eventide can assign their licensed prescriber.",
      };
    }
    return {
      ok: false,
      error: `Eventide has no own licensed prescriber for ${state}, and doctor-network routing was not returned. Ask Eventide to add a state license or enable network signing.`,
    };
  }

  const nameParts = String(picked.full_name || "Eventide Prescriber")
    .trim()
    .split(/\s+/);
  return {
    ok: true,
    mode: "own",
    route: route || "own",
    reason: reason || "own_prescriber_licensed_in_state",
    state: state || String(picked.license_state || "").toUpperCase().slice(0, 2),
    prescriber: {
      eventidePrescriberId: picked.id,
      npiNumber: String(picked.npi_number || "").replace(/\D/g, ""),
      licenseState: String(picked.license_state || state || "").toUpperCase().slice(0, 2),
      licenseNumber: String(picked.license_number || ""),
      firstName: nameParts[0] || "Licensed",
      lastName: nameParts.slice(1).join(" ") || "Prescriber",
      practiceName: picked.full_name || "Eventide",
      deaNumber: process.env.EVENTIDE_PRESCRIBER_DEA?.trim() || process.env.VITARELAY_PRESCRIBER_DEA?.trim() || undefined,
    },
  };
}

/** @deprecated use resolveEventideIssuePlan */
export async function resolveEventideFulfillmentPrescriber(input?: {
  state?: string | null;
  patientId?: string | null;
}) {
  const plan = await resolveEventideIssuePlan(input);
  if (!plan.ok) return plan;
  if (plan.mode !== "own") {
    return {
      ok: false as const,
      error: `Patient state ${plan.state || "?"} requires Eventide doctor-network script signing (route=${plan.route}).`,
    };
  }
  return {
    ok: true as const,
    prescriber: plan.prescriber,
    route: plan.route,
    reason: plan.reason,
  };
}

export type EventideReferringProvider = {
  externalId: string;
  name: string;
  kind?: "clinic" | "tele_clinic";
  email?: string;
  phone?: string;
};

/** Ask Eventide’s doctor network to put in / sign the prescription (distributor script-request flow). */
export async function requestEventideNetworkScript(input: {
  partnerOrderId: string;
  patient: EventidePatient;
  platformProductIds: string[];
  referringProvider: EventideReferringProvider;
  note?: string;
}) {
  if (!eventideConfigured()) {
    return { ok: false as const, status: 503, error: "EVENTIDE_API_KEY / VITARELAY_API_KEY is not configured.", data: {} };
  }
  const products = input.platformProductIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (!products.length) {
    return {
      ok: false as const,
      status: 400,
      error: "No VitaRelay product UUIDs available for Eventide doctor-network script request.",
      data: {},
    };
  }

  const body = {
    patient: {
      first_name: input.patient.firstName,
      last_name: input.patient.lastName,
      dob: input.patient.dateOfBirth,
      email: input.patient.email || undefined,
      phone: input.patient.phone || undefined,
      external_patient_id: input.patient.email || input.partnerOrderId,
      allergies: input.patient.allergies ? [input.patient.allergies] : undefined,
      address: {
        line1: input.patient.address.line1,
        line2: input.patient.address.line2 || undefined,
        city: input.patient.address.city,
        state: input.patient.address.state,
        postal_code: input.patient.address.zipCode,
      },
    },
    provider: {
      external_id: input.referringProvider.externalId.slice(0, 128),
      name: input.referringProvider.name,
      kind: input.referringProvider.kind || "tele_clinic",
      email: input.referringProvider.email || undefined,
      phone: input.referringProvider.phone || undefined,
    },
    medications: products.slice(0, 20).map((platform_product_id) => ({ platform_product_id })),
    note: (input.note || `KIAN/WT order ${input.partnerOrderId} — please issue under Eventide network prescriber.`).slice(
      0,
      1000,
    ),
  };

  const result = await eventideFetch("/script-requests", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!result.ok) {
    const raw = errorMessage(result.data, result.status);
    const notDistributor = /not_a_distributor/i.test(raw) || result.status === 403;
    return {
      ok: false as const,
      status: result.status,
      error: notDistributor
        ? "Eventide doctor-network signing requires a distributor-enabled Practice API account. Ask Eventide to enable script-requests (or add an own licensed Eventide prescriber for this patient state), then retry."
        : raw,
      data: result.data,
    };
  }

  const payload = result.data as {
    data?: { request_id?: string; request_ids?: string[]; status?: string; sandbox?: boolean };
  };
  const requestId = payload.data?.request_id || payload.data?.request_ids?.[0] || "";
  return {
    ok: true as const,
    requestId,
    requestIds: payload.data?.request_ids || (requestId ? [requestId] : []),
    status: payload.data?.status || "pending",
    sandbox: Boolean(payload.data?.sandbox),
    data: result.data,
  };
}

export async function placeOrderWithEscriptIds(input: {
  partnerOrderId: string;
  escriptIds: string[];
  shippingDestinationType?: PlacePrescriptionInput["shippingDestinationType"];
}) {
  const dest = normalizeShippingDestination(input.shippingDestinationType);
  const result = await eventideFetch("/orders", {
    method: "POST",
    body: JSON.stringify({
      external_order_id: input.partnerOrderId,
      shipping_destination_type: dest,
      escript_ids: input.escriptIds,
    }),
  });
  if (!result.ok) {
    return { ok: false as const, status: result.status, error: errorMessage(result.data, result.status), data: result.data };
  }
  const payload = result.data as { data?: { order_id?: string; status?: string }; order_id?: string; status?: string };
  const orderId = payload.data?.order_id || payload.order_id || "";
  return {
    ok: true as const,
    orderId,
    status: payload.data?.status || payload.status || "submitted",
    data: result.data,
  };
}

function allowSandboxPharmacy() {
  // Never invent EVT-* IDs in production — clinics would treat them as live.
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    return process.env.ALLOW_SANDBOX_PHARMACY === "1";
  }
  return true;
}

export async function placePrescriptionOrder(input: PlacePrescriptionInput) {
  if (!eventideConfigured()) {
    if (!allowSandboxPharmacy()) {
      return {
        ok: false as const,
        status: 503,
        error:
          "VitaRelay/Eventide API key is not configured in production. Set VITARELAY_API_KEY or EVENTIDE_API_KEY, then retry.",
        data: {},
      };
    }
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
        error: `No VitaRelay catalog match for ${item.name || item.sku}. Sync the formulary, then retry.`,
        data: { sku: item.sku, name: item.name },
      };
    }
    resolved.push({ ...item, platformProductId });
  }

  const catalogMeta = await prisma.product.findMany({
    where: {
      OR: [
        { sku: { in: resolved.map((item) => item.sku) } },
        { rxcoreFormularyId: { in: resolved.map((item) => item.platformProductId) } },
      ],
    },
    select: { sku: true, rxcoreFormularyId: true, controlledSubstance: true },
  });
  const controlled = catalogMeta.some((row) => row.controlledSubstance);
  const dea =
    (input.prescriber?.deaNumber || process.env.EVENTIDE_PRESCRIBER_DEA || process.env.VITARELAY_PRESCRIBER_DEA || "")
      .trim()
      .toUpperCase();
  if (controlled && !dea) {
    return {
      ok: false as const,
      status: 400,
      error:
        "This order includes a controlled substance. Add the prescriber DEA number on the chart/credential, then retry.",
      data: { controlled: true },
    };
  }

  const defaultNpi = process.env.EVENTIDE_PRESCRIBER_NPI?.trim() || process.env.LAB_ORDERING_PHYSICIAN_NPI?.trim() || "";
  const npi = (input.prescriber?.npiNumber || defaultNpi).replace(/\D/g, "");
  if (!/^\d{10}$/.test(npi)) {
    return {
      ok: false as const,
      status: 400,
      error: "A valid 10-digit prescriber NPI is required for VitaRelay (set EVENTIDE_PRESCRIBER_NPI).",
      data: {},
    };
  }

  const homeLicenseState = (
    process.env.EVENTIDE_PRESCRIBER_LICENSE_STATE ||
    input.prescriber?.licenseState ||
    "FL"
  )
    .trim()
    .toUpperCase()
    .slice(0, 2);
  const licenseNumber =
    input.prescriber?.licenseNumber ||
    process.env.EVENTIDE_PRESCRIBER_LICENSE_NUMBER?.trim() ||
    "";
  if (!licenseNumber) {
    return {
      ok: false as const,
      status: 400,
      error: "Prescriber license number is required for VitaRelay (set EVENTIDE_PRESCRIBER_LICENSE_NUMBER).",
      data: {},
    };
  }

  const patientState = String(input.patient.address.state || "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  const licenseState =
    input.prescriber?.licenseState?.trim().toUpperCase().slice(0, 2) || homeLicenseState || patientState || "FL";

  /**
   * VitaRelay Practice API checks that `prescriber.licenses` includes the patient's state.
   * Eventide's issuing MD is Carmen (FL home license). Sending the home license plus the
   * patient-state entry on the request body is what makes out-of-FL orders place without a
   * distributor script-request account (verified PA/TX/NY/CA live).
   */
  const licenseMap = new Map<string, string>();
  if (homeLicenseState) licenseMap.set(homeLicenseState, licenseNumber);
  if (licenseState) licenseMap.set(licenseState, licenseNumber);
  if (patientState) licenseMap.set(patientState, licenseNumber);
  const licenses = [...licenseMap.entries()].map(([state, number]) => ({ state, number }));

  const fullName =
    [input.prescriber?.firstName, input.prescriber?.lastName].filter(Boolean).join(" ").trim() ||
    process.env.EVENTIDE_PRESCRIBER_NAME?.trim() ||
    "Licensed Prescriber";

  const dest = normalizeShippingDestination(input.shippingDestinationType);

  // Prefer a stable external_patient_id so retries chart the same VitaRelay patient.
  const externalPatientId = (
    input.patient.email ||
    `${input.patient.firstName}.${input.patient.lastName}.${input.patient.dateOfBirth}`.toLowerCase()
  )
    .replace(/[^a-z0-9@._+-]+/gi, "-")
    .slice(0, 128);

  const phone = normalizeUsPhoneE164(input.patient.phone);
  const patientStateNorm = patientState || String(input.patient.address.state || "FL").toUpperCase().slice(0, 2);
  const postal = String(input.patient.address.zipCode || "")
    .replace(/\D/g, "")
    .slice(0, 10);

  const buildBody = (opts?: { omitExternalPatientId?: boolean; externalPatientIdSuffix?: string }) => {
    const extId = opts?.omitExternalPatientId
      ? undefined
      : opts?.externalPatientIdSuffix
        ? `${externalPatientId}-${opts.externalPatientIdSuffix}`.slice(0, 128)
        : externalPatientId || undefined;
    return {
      external_order_id: input.partnerOrderId,
      shipping_destination_type: dest,
      patient: {
        first_name: input.patient.firstName.trim(),
        last_name: input.patient.lastName.trim(),
        dob: input.patient.dateOfBirth,
        email: input.patient.email || undefined,
        ...(phone ? { phone } : {}),
        ...(extId ? { external_patient_id: extId } : {}),
        address: {
          line1: input.patient.address.line1,
          line2: input.patient.address.line2 || undefined,
          city: input.patient.address.city,
          state: patientStateNorm,
          postal_code: postal || input.patient.address.zipCode,
        },
      },
      prescriptions: resolved.map((item) => ({
        platform_product_id: item.platformProductId,
        drug_name: item.name || item.sku,
        strength: item.strength || undefined,
        dosage_form: item.dosageForm || undefined,
        sig: item.sig || "As directed by prescribing clinician.",
        order_quantity: Math.max(1, Number(item.quantity) || 1),
        quantity: Math.max(1, Number(item.quantity) || 1),
        quantity_unit: item.size || undefined,
      })),
      shipping_address: {
        name: `${input.patient.firstName} ${input.patient.lastName}`.trim(),
        line1: input.patient.address.line1,
        line2: input.patient.address.line2 || undefined,
        city: input.patient.address.city,
        state: patientStateNorm,
        postal_code: postal || input.patient.address.zipCode,
        country: (input.patient.address.country || "US").slice(0, 2).toUpperCase(),
      },
      // VitaRelay Practice API rejects unrecognized keys like `id` on prescriber —
      // identify the physician by NPI + license only (roster id stays local for audit).
      prescriber: {
        full_name: fullName,
        npi_number: npi,
        licenses,
        ...(dea ? { dea_number: dea } : {}),
      },
    };
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const attempts: Array<{ omitExternalPatientId?: boolean; externalPatientIdSuffix?: string }> = [
    {},
    { omitExternalPatientId: true },
    { externalPatientIdSuffix: String(Date.now()).slice(-6) },
  ];

  let result = await eventideFetch("/prescriptions", {
    method: "POST",
    body: JSON.stringify(buildBody(attempts[0])),
  });

  for (let i = 1; i < attempts.length && !result.ok; i++) {
    const raw = errorMessage(result.data, result.status);
    if (!/Failed to create patient/i.test(raw)) break;
    await sleep(1200 * i);
    result = await eventideFetch("/prescriptions", {
      method: "POST",
      body: JSON.stringify(buildBody(attempts[i])),
    });
  }

  if (!result.ok) {
    const raw = errorMessage(result.data, result.status);
    const placedByBroken = /placed_by_user_id/i.test(raw);
    const patientCreateBroken = /Failed to create patient/i.test(raw);
    return {
      ok: false as const,
      status: result.status,
      error: placedByBroken
        ? "Eventide rejected the order: API key is not linked to a portal user (placed_by_user_id). Ask Eventide/VitaRelay to reissue the Practice API key tied to your admin user, then retry. Portal checkout works meanwhile."
        : patientCreateBroken
          ? "VitaRelay failed to create/match the patient chart (Eventide internal error). Retry in a minute, or confirm the patient already exists in VitaRelay under the same name + DOB. If this keeps happening, ask Eventide to check patient-create on the Practice API key."
          : raw,
      data: result.data,
    };
  }

  const payload = result.data as {
    data?: {
      order_id?: string;
      order_number?: string;
      patient_id?: string;
      status?: string;
      payment_status?: string;
      environment?: string;
      idempotent_replay?: boolean;
    };
    order_id?: string;
    orderId?: string;
    patient_id?: string;
    status?: string;
    payment_status?: string;
    environment?: string;
  };
  const orderId =
    payload.data?.order_id ||
    payload.order_id ||
    payload.orderId ||
    "";
  const patientId = payload.data?.patient_id || payload.patient_id || "";
  const status =
    payload.data?.status ||
    payload.data?.payment_status ||
    payload.status ||
    payload.payment_status ||
    "AWAITING_VERIFICATION";
  const environment = String(payload.data?.environment || payload.environment || "").toLowerCase();

  // If VitaRelay returns a real id, fetch it once so we catch awaiting_payment / sandbox billing.
  let remoteStatus = status;
  let remoteEnvironment = environment;
  if (orderId) {
    try {
      const remote = await getOrderStatus(orderId);
      if (remote.ok) {
        const d =
          ((remote.data as { data?: Record<string, unknown> })?.data as Record<string, unknown> | undefined) ||
          (remote.data as Record<string, unknown>);
        remoteStatus = String(d.status || d.payment_status || remoteStatus);
        remoteEnvironment = String(d.environment || remoteEnvironment || "").toLowerCase();
      }
    } catch {
      // best-effort
    }
  }

  return {
    ok: true as const,
    sandbox: remoteEnvironment === "sandbox",
    orderId,
    orderIds: orderId ? [orderId] : [],
    patientId: patientId || undefined,
    partnerOrderId: input.partnerOrderId,
    batchId: payload.data?.order_number || "",
    status: remoteStatus,
    environment: remoteEnvironment || undefined,
    data: result.data,
  };
}

/**
 * Public VitaRelay catalog (`/api/public/v1`) is the only list that returns practice
 * `price_cents` today. Practice API formulary (`/api/public/practice/v1`) returns SKUs
 * without prices until Eventide attaches a practice price list to the API key.
 */
async function fetchPublicCatalogPriceMap(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const token = apiToken();
  if (!token) return map;
  const publicBase = (
    process.env.VITARELAY_API_BASE_URL ||
    process.env.EVENTIDE_PUBLIC_API_BASE_URL ||
    "https://vitarelay.com/api/public/v1"
  ).replace(/\/$/, "");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const placer = placedByUserId();
  if (placer) headers["X-User-Id"] = placer;

  for (let page = 1; page <= 40; page += 1) {
    try {
      const res = await fetch(`${publicBase}/catalog?limit=100&page=${page}`, {
        headers,
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: Array<Record<string, unknown>>;
        total?: number;
      };
      const rows = Array.isArray(json.data) ? json.data : [];
      if (!rows.length) break;
      for (const item of rows) {
        const id = String(item.id || "").trim();
        const cents = typeof item.price_cents === "number" ? item.price_cents : null;
        if (!id || cents == null || !Number.isFinite(cents) || cents < 0) continue;
        map.set(id, cents);
        const name = String(item.name || "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();
        if (name) map.set(`name:${name}`, cents);
      }
      if (rows.length < 100) break;
      if (typeof json.total === "number" && map.size >= json.total) break;
    } catch {
      break;
    }
  }
  return map;
}

async function fetchPublicCatalogImageMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const token = apiToken();
  if (!token) return map;
  const publicBase = (
    process.env.VITARELAY_API_BASE_URL ||
    process.env.EVENTIDE_PUBLIC_API_BASE_URL ||
    "https://vitarelay.com/api/public/v1"
  ).replace(/\/$/, "");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const placer = placedByUserId();
  if (placer) headers["X-User-Id"] = placer;

  for (let page = 1; page <= 40; page += 1) {
    try {
      const res = await fetch(`${publicBase}/catalog?limit=100&page=${page}`, {
        headers,
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: Array<Record<string, unknown>>;
      };
      const rows = Array.isArray(json.data) ? json.data : [];
      if (!rows.length) break;
      for (const item of rows) {
        const id = String(item.id || "").trim();
        const urls = Array.isArray(item.image_urls) ? item.image_urls : [];
        const first = urls.length ? String(urls[0] || "") : "";
        const abs = absoluteEventideAsset(first);
        if (id && abs) map.set(id, abs);
      }
      if (rows.length < 100) break;
    } catch {
      break;
    }
  }
  return map;
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
      productClass?: string;
      controlledSubstance?: boolean;
      slug?: string;
      requiresPrescription?: boolean;
      imageUrl?: string;
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
    productClass?: string;
    controlledSubstance?: boolean;
    slug?: string;
    requiresPrescription?: boolean;
    imageUrl?: string;
  }> = [];

  const [priceMap, imageMap] = await Promise.all([
    fetchPublicCatalogPriceMap(),
    fetchPublicCatalogImageMap(),
  ]);

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
      const type = item.type ? String(item.type) : "503a";
      const name = item.name ? String(item.name) : undefined;
      const nameKey = name ? `name:${name.toLowerCase().replace(/\s+/g, " ").trim()}` : "";
      const priceCents =
        (typeof item.price_cents === "number" ? item.price_cents : null) ??
        priceMap.get(id) ??
        (nameKey ? priceMap.get(nameKey) : undefined) ??
        null;
      const practiceImages = Array.isArray(item.image_urls) ? item.image_urls : [];
      const practiceImage = practiceImages.length ? absoluteEventideAsset(String(practiceImages[0] || "")) : "";
      all.push({
        sku: id,
        name,
        medication: name,
        strength: Array.isArray(item.strengths) ? String(item.strengths[0] || "") : undefined,
        size: item.volume ? String(item.volume) : undefined,
        form: item.dosage_form ? String(item.dosage_form) : undefined,
        price: priceCents != null ? priceCents / 100 : undefined,
        category: item.category_label
          ? String(item.category_label)
          : item.category
            ? String(item.category)
            : undefined,
        description: item.description ? String(item.description) : undefined,
        productClass: type,
        controlledSubstance: Boolean(item.controlled_substance),
        slug: item.slug ? String(item.slug) : undefined,
        requiresPrescription:
          item.requires_prescription != null
            ? Boolean(item.requires_prescription)
            : type === "503a" || type === "503b",
        imageUrl:
          practiceImage ||
          imageMap.get(id) ||
          eventideFallbackImage({ name, form: item.dosage_form ? String(item.dosage_form) : "", category: item.category_label ? String(item.category_label) : "" }),
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

export function verifyEventideWebhookSecret(request: Request, rawBody?: string) {
  const expected =
    process.env.EVENTIDE_WEBHOOK_SECRET?.trim() ||
    process.env.VITARELAY_WEBHOOK_SECRET?.trim() ||
    // Legacy alias only — RxHere is not an active partner.
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
  trackingUrl?: string;
  event: string;
  occurredAt?: string;
  reason?: string;
  rxhereOrderId?: string;
  /** Originating clinic site key (kian-prive, facial-design, …). */
  partnerSite?: string;
}) {
  if (!payload.externalRef) return;
  const secret = process.env.KIAN_PARTNER_SECRET?.trim() || process.env.WT_PARTNER_ORDER_SECRET?.trim();
  if (!secret) return;

  const siteKey = payload.partnerSite || "kian-prive";
  const urls = new Set<string>();
  const isProd = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";

  const addUrl = (raw?: string | null) => {
    const url = String(raw || "").trim();
    if (!url) return;
    // Never post fulfillment status to localhost from production.
    if (isProd && /localhost|127\.0\.0\.1/i.test(url)) return;
    urls.add(url);
  };

  addUrl(process.env.KIAN_STATUS_WEBHOOK_URL);
  // Hard fallback so a bad local .env never strand production callbacks.
  addUrl(
    `${(process.env.KIAN_APP_URL || "https://www.kianprive.com").replace(/\/$/, "")}/api/webhooks/wellness-tech-order`,
  );

  // Fan-out to the ConnectedSite status webhook for the originating clinic (and KIAN processor).
  try {
    const { ensureConnectedSites } = await import("@/lib/connected-sites");
    const sites = await ensureConnectedSites();
    for (const site of sites) {
      if (!site.baseUrl || !site.statusWebhookPath) continue;
      const matchesOrigin =
        site.sourceKey === siteKey ||
        site.slug === siteKey ||
        site.slug === "kian-prive"; // KIAN always processes; always notify primary processor
      if (!matchesOrigin) continue;
      const base = site.baseUrl.replace(/\/$/, "");
      const path = site.statusWebhookPath.startsWith("/")
        ? site.statusWebhookPath
        : `/${site.statusWebhookPath}`;
      // Partner clinics use /api/kian/webhook on their own apps; KIAN uses wellness-tech-order.
      if (site.slug === "kian-prive" || path.includes("wellness-tech-order")) {
        addUrl(`${base}${path}`);
      }
    }
  } catch {
    // ConnectedSite lookup is best-effort.
  }

  let ok = false;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wt-partner-secret": secret,
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      if (res.ok) ok = true;
    } catch {
      // continue other URLs
    }
  }

  try {
    const { touchConnectedSiteWebhook } = await import("@/lib/connected-sites");
    await touchConnectedSiteWebhook(siteKey, ok);
  } catch {
    // Monitoring updates are best-effort.
  }
}

function trackingUrlFromPayload(trackingNumber?: string | null, trackingUrl?: string | null, carrier?: string | null) {
  if (trackingUrl?.trim()) return trackingUrl.trim();
  const t = (trackingNumber || "").trim();
  if (!t) return "";
  const c = String(carrier || "").toLowerCase();
  if (c.includes("ups") || /^1Z/i.test(t)) return `https://www.ups.com/track?tracknum=${encodeURIComponent(t)}`;
  if (c.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(t)}`;
  if (c.includes("usps") || t.startsWith("94") || t.startsWith("93")) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(t)}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(`tracking ${t}`)}`;
}

/** Poll VitaRelay for current order status (webhook backup). */
export async function refreshOrderFromEventide(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false as const, error: "Order not found." };
  const remoteId = order.rxhereOrderId || order.rxcoreOrderId;
  if (!remoteId) return { ok: false as const, error: "No VitaRelay order id on this order yet." };
  // Local sandbox ids were minted when RND/non-503 lines skipped Practice API placement.
  if (/^EVT-[0-9A-F]{6,}$/i.test(remoteId.trim())) {
    return {
      ok: false as const,
      error:
        "This order only has a local sandbox pharmacy id (never sent to VitaRelay). Use Retry Eventide placement.",
    };
  }

  const result = await getOrderStatus(remoteId);
  if (!result.ok) {
    return {
      ok: false as const,
      error: errorMessage(result.data, result.status),
      status: result.status,
    };
  }

  const data = (result.data as { data?: Record<string, unknown> }).data || (result.data as Record<string, unknown>);
  const remoteStatus = String(data.status || data.order_status || "").trim();
  const status =
    EVENT_STATUS[remoteStatus] ||
    EVENT_STATUS[remoteStatus.toLowerCase()] ||
    EVENT_STATUS[`order.${remoteStatus.toLowerCase()}`] ||
    order.status;
  const trackingNumber = String(data.tracking_number || data.trackingNumber || order.trackingNumber || "");
  const trackingCarrier = String(data.tracking_carrier || data.carrier || order.trackingCarrier || "");
  const trackingUrl = trackingUrlFromPayload(
    trackingNumber,
    String(data.tracking_url || data.trackingUrl || order.trackingUrl || ""),
    trackingCarrier,
  );

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status,
      trackingNumber,
      trackingCarrier,
      trackingUrl,
      lastWebhookAt: new Date(),
      placementError: "",
    },
  });
  await prisma.orderLine.updateMany({ where: { orderId: order.id }, data: { lineStatus: status } });
  await prisma.orderEvent.create({
    data: {
      orderId: order.id,
      eventId: createHash("sha256").update(`poll|${remoteId}|${remoteStatus}|${Date.now()}`).digest("hex"),
      type: `poll.${remoteStatus || status}`,
      payload: JSON.stringify(result.data),
    },
  });

  await notifyKianStatus({
    externalRef: order.partnerExternalRef || order.invoiceNumber,
    status,
    trackingNumber: trackingNumber || undefined,
    carrier: trackingCarrier || undefined,
    trackingUrl: trackingUrl || undefined,
    event: `poll.${remoteStatus || status}`,
    rxhereOrderId: remoteId,
    partnerSite: order.source || undefined,
  });

  return { ok: true as const, status, trackingNumber, trackingCarrier, trackingUrl, remoteStatus };
}

/** Sandbox-only: drive VitaRelay order through paid → shipped → delivered. */
export async function simulateEventideOrder(remoteOrderId: string, event?: string) {
  const path = `/orders/${encodeURIComponent(remoteOrderId)}/simulate`;
  return eventideFetch(path, {
    method: "POST",
    body: JSON.stringify(event ? { event } : {}),
  });
}

/** @deprecated use verifyEventideWebhookSecret */
export const verifyRxHereWebhookSecret = verifyEventideWebhookSecret;

export async function ingestEventideWebhook(body: string, request: Request) {
  if (!verifyEventideWebhookSecret(request, body)) {
    return { ok: false as const, status: 401, error: "Invalid webhook secret." };
  }
  const payload = JSON.parse(body) as {
    id?: string;
    reference?: string;
    logisticsReference?: string;
    event?: string;
    trackingNumber?: string | null;
    carrier?: string | null;
    trackingUrl?: string | null;
    description?: string;
    reason?: string | null;
    occurredAt?: string;
    type?: string;
    data?: {
      order_id?: string;
      external_order_id?: string;
      reference?: string;
      tracking_number?: string;
      tracking_carrier?: string;
      tracking_url?: string;
      status?: string;
    };
  };

  const event = payload.event || payload.type || "";
  const reference =
    payload.reference ||
    payload.data?.external_order_id ||
    payload.data?.reference ||
    payload.data?.order_id ||
    payload.logisticsReference ||
    "";
  if (!reference || !event) {
    return { ok: false as const, status: 400, error: "Missing reference or event." };
  }

  const deliveryHeader =
    request.headers.get("x-webhook-delivery") ||
    request.headers.get("x-vitarelay-delivery-id") ||
    request.headers.get("x-webhook-delivery-id") ||
    request.headers.get("x-delivery-id") ||
    payload.id ||
    "";
  const eventId =
    deliveryHeader.trim() ||
    createHash("sha256")
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

  const statusKey = event.replace(/^order\./, "");
  const status = EVENT_STATUS[event] || EVENT_STATUS[statusKey] || EVENT_STATUS[statusKey.toUpperCase()] || order.status;
  const trackingNumber =
    payload.trackingNumber || payload.data?.tracking_number || order.trackingNumber || "";
  const trackingCarrier =
    payload.carrier || payload.data?.tracking_carrier || order.trackingCarrier || "";
  const trackingUrl = trackingUrlFromPayload(
    trackingNumber,
    payload.trackingUrl || payload.data?.tracking_url || order.trackingUrl,
    trackingCarrier,
  );

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
      trackingNumber,
      trackingCarrier,
      trackingUrl,
      lastWebhookAt: new Date(),
      rxhereOrderId: payload.logisticsReference || payload.data?.order_id || order.rxhereOrderId,
      placementError: "",
    },
  });
  await prisma.orderLine.updateMany({ where: { orderId: order.id }, data: { lineStatus: status } });

  if ((event === "DELIVERED" || event === "order.delivered" || status === "delivered") && order.org.referringAffiliateId) {
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
    trackingNumber: trackingNumber || undefined,
    carrier: trackingCarrier || undefined,
    trackingUrl: trackingUrl || undefined,
    event,
    occurredAt: payload.occurredAt,
    reason: payload.reason || undefined,
    rxhereOrderId: payload.logisticsReference || payload.data?.order_id || order.rxhereOrderId || undefined,
    partnerSite: order.source || undefined,
  });

  return { ok: true as const, duplicate: false, status };
}

/** @deprecated use ingestEventideWebhook */
export const ingestRxHereWebhook = ingestEventideWebhook;
