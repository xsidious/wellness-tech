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
const practice = (
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

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${practice}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 1000) };
  }
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  const stamp = Date.now();
  const productId = "119df359-ebf4-4c6a-8084-64cdadac5853";
  const patientId = "7cb3194e-5bcc-49d3-acd9-9aad29cc7334"; // from FL chart
  const npi = (process.env.EVENTIDE_PRESCRIBER_NPI || "1023022357").replace(/\D/g, "");
  const flLic = process.env.EVENTIDE_PRESCRIBER_LICENSE_NUMBER || "84581";

  const cases = [
    {
      label: "orders RND PA ship existing FL patient",
      body: {
        external_order_id: `WT-ORD-PA-${stamp}`,
        patient_id: patientId,
        items: [{ platform_product_id: productId, quantity: 1 }],
        shipping_destination_type: "patient_direct",
        shipping_address: {
          name: "Portal Smoke",
          line1: "100 Market St",
          city: "Philadelphia",
          state: "PA",
          postal_code: "19107",
          country: "US",
        },
      },
    },
    {
      label: "orders RND FL ship existing patient",
      body: {
        external_order_id: `WT-ORD-FL-${stamp}`,
        patient_id: patientId,
        items: [{ platform_product_id: productId, quantity: 1 }],
        shipping_destination_type: "patient_direct",
        shipping_address: {
          name: "Portal Smoke",
          line1: "200 Biscayne Blvd",
          city: "Miami",
          state: "FL",
          postal_code: "33131",
          country: "US",
        },
      },
    },
    {
      label: "orders RND practice_office ship",
      body: {
        external_order_id: `WT-ORD-OFF-${stamp}`,
        patient_id: patientId,
        items: [{ platform_product_id: productId, quantity: 1 }],
        shipping_destination_type: "practice_office",
        shipping_address: {
          name: "Wellness Tech Distribution",
          line1: "200 Biscayne Blvd",
          city: "Miami",
          state: "FL",
          postal_code: "33131",
          country: "US",
        },
      },
    },
  ];

  for (const c of cases) {
    const r = await call("POST", "/orders", c.body);
    console.log(
      JSON.stringify(
        {
          label: c.label,
          ok: r.ok,
          status: r.status,
          error: (r.data as { error?: unknown })?.error,
          preview: JSON.stringify(r.data).slice(0, 900),
        },
        null,
        2,
      ),
    );
  }

  // Find a 503A product that is available
  const catalog = await call("GET", "/catalog?limit=100&page=1");
  const rows = Array.isArray((catalog.data as { data?: unknown[] })?.data)
    ? ((catalog.data as { data: Array<Record<string, unknown>> }).data)
    : [];
  const rx = rows.find((r) => r.requires_prescription === true && r.controlled_substance !== true);
  const rnd = rows.find((r) => r.type === "rnd" || r.requires_prescription === false);
  console.log(
    "sample",
    JSON.stringify({
      rx: rx ? { id: rx.id, name: rx.name, type: rx.type, requires: rx.requires_prescription } : null,
      rnd: rnd ? { id: rnd.id, name: rnd.name, type: rnd.type, requires: rnd.requires_prescription } : null,
      types: [...new Set(rows.map((r) => r.type))],
    }),
  );

  // Try upserting Carmen with multi-state licenses via POST /prescribers
  console.log(
    "upsert carmen multi license",
    JSON.stringify(
      await call("POST", "/prescribers", {
        full_name: "Carmen Ramirez",
        npi_number: npi,
        license_state: "PA",
        license_number: flLic,
        role: "prescriber",
      }),
      null,
      2,
    ).slice(0, 800),
  );

  // Can we POST prescriptions for PA patient if we claim Carmen has PA license with a plausible PA license format?
  // Don't invent fake medical licenses for real placement - just see API validation.
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
