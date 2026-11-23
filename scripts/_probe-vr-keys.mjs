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
const keys = {
  VITARELAY_API_KEY: env.VITARELAY_API_KEY || "",
  EVENTIDE_API_KEY: env.EVENTIDE_API_KEY || "",
  EVENTIDE_API_TOKEN: env.EVENTIDE_API_TOKEN || "",
  EVENTIDE_API_KEY: env.EVENTIDE_API_KEY || "",
};

function classify(k) {
  if (!k) return "missing";
  if (k.startsWith("vr_live_")) return "live";
  if (k.startsWith("vr_test_")) return "test";
  return "unknown";
}

console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(keys).map(([name, val]) => [
        name,
        {
          present: Boolean(val),
          kind: classify(val),
          prefix: val ? val.slice(0, 14) : null,
          len: val.length,
          sameAsVitarelay: val && env.VITARELAY_API_KEY ? val === env.VITARELAY_API_KEY : null,
          sameAsEventide: val && env.EVENTIDE_API_KEY ? val === env.EVENTIDE_API_KEY : null,
        },
      ]),
    ),
    null,
    2,
  ),
);

const orderId = "3ab825bb-21b1-4217-996c-bd235a6ec270";
const bases = [
  "https://vitarelay.com/api/public/practice/v1",
  "https://vitarelay.com/api/public/v1",
];

for (const [name, key] of Object.entries(keys)) {
  if (!key) continue;
  for (const base of bases) {
    const headers = {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    };
    if (env.EVENTIDE_PLACED_BY_USER_ID) headers["X-User-Id"] = env.EVENTIDE_PLACED_BY_USER_ID;
    const res = await fetch(`${base}/orders/${orderId}`, { headers, cache: "no-store" });
    const text = await res.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 300) };
    }
    const d = data.data || data;
    console.log(
      JSON.stringify(
        {
          keyName: name,
          base,
          status: res.status,
          order_number: d.order_number,
          order_status: d.status,
          payment_status: d.payment_status,
          environment: d.environment,
          total_cents: d.total_cents,
        },
        null,
        2,
      ),
    );
  }
}

// Place a tiny probe only if asked via env
if (process.env.PLACE_LIVE_PROBE === "1") {
  const key = env.VITARELAY_API_KEY || env.EVENTIDE_API_KEY;
  const base = "https://vitarelay.com/api/public/practice/v1";
  const headers = {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (env.EVENTIDE_PLACED_BY_USER_ID) headers["X-User-Id"] = env.EVENTIDE_PLACED_BY_USER_ID;
  const catalog = await fetch(`${base}/catalog?limit=20&page=1`, { headers });
  const cat = await catalog.json();
  const rows = Array.isArray(cat.data) ? cat.data : [];
  const product = rows.find((r) => !r.controlled_substance) || rows[0];
  const stamp = Date.now();
  const body = {
    external_order_id: `WT-ENV-PROBE-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: {
      first_name: "Env",
      last_name: "Probe",
      dob: "1990-01-15",
      email: `env.probe+${stamp}@wellnesstechdistribution.com`,
      phone: "+13055550111",
      address: { line1: "200 Biscayne Blvd", city: "Miami", state: "FL", postal_code: "33131" },
    },
    prescriptions: [
      {
        platform_product_id: product.id,
        drug_name: product.name,
        sig: "Env probe — Eventide path",
        order_quantity: 1,
        quantity: 1,
      },
    ],
    shipping_address: {
      name: "Env Probe",
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
  const placed = await fetch(`${base}/prescriptions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const placedText = await placed.text();
  console.log("PLACE", placed.status, placedText.slice(0, 1200));
}
