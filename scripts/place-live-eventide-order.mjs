/**
 * Place one non-controlled live Practice API order and print the remote id.
 * Uses Carmen FL license from env. Unique external_order_id each run.
 */
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
const key = env.VITARELAY_API_KEY || env.EVENTIDE_API_KEY || env.EVENTIDE_API_TOKEN || "";
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
    data = { raw: text.slice(0, 500) };
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
    data = { raw: text.slice(0, 500) };
  }
  return { ok: res.ok, status: res.status, data };
}

const catalog = await get("/catalog?limit=50&page=1");
const rows = Array.isArray(catalog.data?.data) ? catalog.data.data : [];
const product = rows.find((r) => !r.controlled_substance) || null;
if (!catalog.ok || !product) {
  console.error(JSON.stringify({ error: "No non-controlled catalog product", catalog }, null, 2));
  process.exit(1);
}

const stamp = Date.now();
const externalOrderId = `WT-LIVE-SMOKE-${stamp}`;
const body = {
  external_order_id: externalOrderId,
  shipping_destination_type: "patient_direct",
  patient: {
    first_name: "Portal",
    last_name: "Smoke",
    dob: "1988-04-12",
    email: `portal.smoke+${stamp}@wellnesstechdistribution.com`,
    phone: "+13055550199",
    external_patient_id: `wt-smoke-${stamp}`,
    address: {
      line1: "200 Biscayne Blvd",
      city: "Miami",
      state: "FL",
      postal_code: "33131",
    },
  },
  prescriptions: [
    {
      platform_product_id: product.id,
      drug_name: product.name || "Smoke Rx",
      strength: product.strength || undefined,
      dosage_form: product.dosage_form || undefined,
      sig: "As directed by prescribing clinician — WT live smoke.",
      order_quantity: 1,
      quantity: 1,
    },
  ],
  shipping_address: {
    name: "Portal Smoke",
    line1: "200 Biscayne Blvd",
    city: "Miami",
    state: "FL",
    postal_code: "33131",
    country: "US",
  },
  prescriber: {
    full_name: env.EVENTIDE_PRESCRIBER_NAME || "Carmen Ramirez",
    npi_number: (env.EVENTIDE_PRESCRIBER_NPI || "").replace(/\D/g, ""),
    licenses: [
      {
        state: env.EVENTIDE_PRESCRIBER_LICENSE_STATE || "FL",
        number: env.EVENTIDE_PRESCRIBER_LICENSE_NUMBER || "",
      },
    ],
  },
};

const placed = await post("/prescriptions", body);
const data = placed.data?.data || placed.data || {};
const orderId = data.order_id || data.orderId || "";
const orderNumber = data.order_number || data.orderNumber || "";

console.log(
  JSON.stringify(
    {
      placedOk: placed.ok,
      placedStatus: placed.status,
      externalOrderId,
      orderId,
      orderNumber,
      product: { id: product.id, name: product.name, controlled: product.controlled_substance },
      error: placed.ok ? undefined : placed.data,
      remote: placed.ok ? data : undefined,
    },
    null,
    2,
  ),
);

if (!placed.ok || !orderId) process.exit(1);

const status = await get(`/orders/${encodeURIComponent(orderId)}`);
console.log(
  JSON.stringify(
    {
      statusOk: status.ok,
      statusHttp: status.status,
      order: status.data?.data || status.data,
    },
    null,
    2,
  ),
);
