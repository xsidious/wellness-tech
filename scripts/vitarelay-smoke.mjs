import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

const env = loadEnv();
const key =
  env.VITARELAY_API_KEY || env.EVENTIDE_API_KEY || env.EVENTIDE_API_TOKEN || "";
const base = (
  env.VITARELAY_PRACTICE_API_BASE_URL ||
  env.EVENTIDE_API_BASE_URL ||
  "https://vitarelay.com/api/public/practice/v1"
).replace(/\/$/, "");
const placer = env.EVENTIDE_PLACED_BY_USER_ID || env.VITARELAY_PLACED_BY_USER_ID || "";

const headers = {
  Authorization: `Bearer ${key}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};
if (placer) headers["X-User-Id"] = placer;

async function get(path) {
  const res = await fetch(`${base}${path}`, { headers, cache: "no-store" });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 400) };
  }
  return { ok: res.ok, status: res.status, data };
}

async function post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 400) };
  }
  return { ok: res.ok, status: res.status, data };
}

console.log(
  JSON.stringify(
    {
      keyPrefix: key.slice(0, 10),
      isTest: key.startsWith("vr_test_"),
      isLive: key.startsWith("vr_live_"),
      base,
      hasPlacer: Boolean(placer),
    },
    null,
    2,
  ),
);

const catalog = await get("/catalog?limit=5&page=1");
const rows = Array.isArray(catalog.data?.data) ? catalog.data.data : [];
console.log(
  JSON.stringify(
    {
      catalogOk: catalog.ok,
      catalogStatus: catalog.status,
      sampleCount: rows.length,
      sample: rows.slice(0, 2).map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        controlled_substance: r.controlled_substance,
        price_cents: r.price_cents,
      })),
    },
    null,
    2,
  ),
);

if (!catalog.ok || !rows.length) {
  console.error("Catalog smoke failed — aborting placement.");
  process.exit(1);
}

if (!key.startsWith("vr_test_")) {
  console.log(
    JSON.stringify({
      placement: "skipped",
      reason: "Live key detected — catalog smoke only. Place a real patient order via portal for live smoke.",
    }),
  );
  process.exit(0);
}

const product = rows.find((r) => !r.controlled_substance) || rows[0];
const externalOrderId = `vr_test_smoke_${Date.now()}`;
const placeBody = {
  external_order_id: externalOrderId,
  shipping_destination_type: "patient_direct",
  patient: {
    first_name: "Sandbox",
    last_name: "Patient",
    dob: "1990-01-15",
    email: "sandbox+vitarelay@thewellnesstech.com",
    phone: "5555550100",
    address: {
      line1: "100 Test St",
      city: "Miami",
      state: "FL",
      postal_code: "33101",
    },
  },
  prescriptions: [
    {
      platform_product_id: product.id,
      drug_name: product.name || "Sandbox Rx",
      sig: "As directed — sandbox E2E",
      order_quantity: 1,
      quantity: 1,
    },
  ],
  shipping_address: {
    name: "Sandbox Patient",
    line1: "100 Test St",
    city: "Miami",
    state: "FL",
    postal_code: "33101",
    country: "US",
  },
  prescriber: {
    full_name: env.EVENTIDE_PRESCRIBER_NAME || "Sandbox Prescriber",
    npi_number: (env.EVENTIDE_PRESCRIBER_NPI || "1234567890").replace(/\D/g, ""),
    licenses: [
      {
        state: env.EVENTIDE_PRESCRIBER_LICENSE_STATE || "FL",
        number: env.EVENTIDE_PRESCRIBER_LICENSE_NUMBER || "ME000000",
      },
    ],
  },
};

const placed = await post("/prescriptions", placeBody);
const orderId =
  placed.data?.data?.order_id || placed.data?.order_id || placed.data?.orderId || "";
console.log(
  JSON.stringify(
    {
      placedOk: placed.ok,
      placedStatus: placed.status,
      externalOrderId,
      orderId,
      error: placed.ok ? undefined : placed.data,
    },
    null,
    2,
  ),
);

if (!placed.ok || !orderId) {
  process.exit(1);
}

const events = ["order.paid", "order.shipped", "order.delivered"];
for (const event of events) {
  const sim = await post(`/orders/${encodeURIComponent(orderId)}/simulate`, { event });
  console.log(JSON.stringify({ simulate: event, ok: sim.ok, status: sim.status, data: sim.data }, null, 2));
}

const status = await get(`/orders/${encodeURIComponent(orderId)}`);
console.log(
  JSON.stringify(
    {
      finalStatusOk: status.ok,
      final: status.data?.data || status.data,
    },
    null,
    2,
  ),
);
