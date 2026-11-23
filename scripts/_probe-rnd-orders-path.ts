/**
 * Prove RND/RUO can place via POST /orders without a state-licensed MD.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}
loadEnv();

const key = process.env.VITARELAY_API_KEY || process.env.EVENTIDE_API_KEY || "";
const base = (
  process.env.VITARELAY_PRACTICE_API_BASE_URL ||
  process.env.EVENTIDE_API_BASE_URL ||
  "https://vitarelay.com/api/public/practice/v1"
).replace(/\/$/, "");
const placer = process.env.EVENTIDE_PLACED_BY_USER_ID || "";
const headers: Record<string, string> = {
  Authorization: `Bearer ${key}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};
if (placer) headers["X-User-Id"] = placer;

async function post(path: string, body: unknown) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 800) };
  }
  return { ok: res.ok, status: res.status, data };
}

async function get(path: string) {
  const res = await fetch(`${base}${path}`, { headers, cache: "no-store" });
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 800) };
  }
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  const stamp = Date.now();
  const productId = "119df359-ebf4-4c6a-8084-64cdadac5853";
  const cat = await get(`/catalog/${productId}`);
  console.log(
    "catalog product",
    JSON.stringify(
      {
        ok: cat.ok,
        status: cat.status,
        type: (cat.data as { data?: Record<string, unknown> })?.data?.product_type ||
          (cat.data as { data?: Record<string, unknown> })?.data?.type ||
          (cat.data as Record<string, unknown>)?.product_type,
        controlled: (cat.data as { data?: Record<string, unknown> })?.data?.controlled_substance,
        name: (cat.data as { data?: Record<string, unknown> })?.data?.name,
        preview: JSON.stringify(cat.data).slice(0, 500),
      },
      null,
      2,
    ),
  );

  const patient = {
    first_name: "Rnd",
    last_name: `Pa${String(stamp).slice(-4)}`,
    dob: "1988-04-12",
    email: `rnd.pa+${stamp}@wellnesstechdistribution.com`,
    phone: "+13055550166",
    external_patient_id: `wt-rnd-pa-${stamp}`,
    address: {
      line1: "100 Market St",
      city: "Philadelphia",
      state: "PA",
      postal_code: "19107",
    },
  };

  const variants = [
    {
      label: "POST /orders items only (no Rx, no MD)",
      path: "/orders",
      body: {
        external_order_id: `WT-RND-ORD-${stamp}`,
        shipping_destination_type: "patient_direct",
        patient,
        items: [{ platform_product_id: productId, quantity: 1 }],
        shipping_address: {
          name: `${patient.first_name} ${patient.last_name}`,
          line1: patient.address.line1,
          city: patient.address.city,
          state: patient.address.state,
          postal_code: patient.address.postal_code,
          country: "US",
        },
      },
    },
    {
      label: "POST /orders product_id field",
      path: "/orders",
      body: {
        external_order_id: `WT-RND-ORD2-${stamp}`,
        shipping_destination_type: "patient_direct",
        patient: { ...patient, email: `rnd.pa2+${stamp}@wellnesstechdistribution.com`, external_patient_id: `wt-rnd-pa2-${stamp}` },
        items: [{ product_id: productId, quantity: 1 }],
        shipping_address: {
          name: `${patient.first_name} ${patient.last_name}`,
          line1: patient.address.line1,
          city: patient.address.city,
          state: patient.address.state,
          postal_code: patient.address.postal_code,
          country: "US",
        },
      },
    },
    {
      label: "POST /prescriptions RND with empty prescriptions + no MD",
      path: "/prescriptions",
      body: {
        external_order_id: `WT-RND-RX-${stamp}`,
        shipping_destination_type: "patient_direct",
        patient: { ...patient, email: `rnd.pa3+${stamp}@wellnesstechdistribution.com`, external_patient_id: `wt-rnd-pa3-${stamp}` },
        prescriptions: [
          {
            platform_product_id: productId,
            drug_name: "AHK-Cu 20mg",
            sig: "For research use as directed",
            order_quantity: 1,
            quantity: 1,
          },
        ],
        shipping_address: {
          name: `${patient.first_name} ${patient.last_name}`,
          line1: patient.address.line1,
          city: patient.address.city,
          state: patient.address.state,
          postal_code: patient.address.postal_code,
          country: "US",
        },
      },
    },
  ];

  for (const v of variants) {
    const result = await post(v.path, v.body);
    console.log(
      JSON.stringify(
        {
          label: v.label,
          ok: result.ok,
          status: result.status,
          error: (result.data as { error?: unknown })?.error,
          orderId:
            (result.data as { data?: { order_id?: string } })?.data?.order_id ||
            (result.data as { order_id?: string })?.order_id,
          preview: JSON.stringify(result.data).slice(0, 600),
        },
        null,
        2,
      ),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
