/**
 * Probe VitaClinic public API (doctor network + order-first for RND).
 * Same key as Practice API — check if scopes allow it.
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
const clinicBase = (
  process.env.VITARELAY_API_BASE_URL ||
  process.env.EVENTIDE_PUBLIC_API_BASE_URL ||
  "https://vitarelay.com/api/public/v1"
).replace(/\/$/, "");
const practiceBase = (
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

async function call(base: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
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
    data = { raw: text.slice(0, 900) };
  }
  return { ok: res.ok, status: res.status, data };
}

function show(label: string, r: { ok: boolean; status: number; data: unknown }) {
  console.log(
    JSON.stringify(
      {
        label,
        ok: r.ok,
        status: r.status,
        error: (r.data as { error?: unknown })?.error,
        preview: JSON.stringify(r.data).slice(0, 1000),
      },
      null,
      2,
    ),
  );
}

async function main() {
  const stamp = Date.now();
  const productId = "119df359-ebf4-4c6a-8084-64cdadac5853";

  console.log("clinicBase", clinicBase);
  console.log("practiceBase", practiceBase);

  for (const path of ["/prescribers", "/products?limit=1", "/catalog?limit=1", "/me", "/account"]) {
    show(`clinic GET ${path}`, await call(clinicBase, "GET", path));
  }

  show(
    "clinic GET /prescriber-route?state=PA",
    await call(clinicBase, "GET", "/prescriber-route?state=PA"),
  );
  show(
    "clinic GET /prescriber-route?state=FL",
    await call(clinicBase, "GET", "/prescriber-route?state=FL"),
  );

  // Create patient on VitaClinic
  const patientBody = {
    first_name: "Clinic",
    last_name: `Pa${String(stamp).slice(-4)}`,
    dob: "1988-04-12",
    email: `clinic.pa+${stamp}@wellnesstechdistribution.com`,
    phone: "+13055550144",
    external_patient_id: `wt-clinic-pa-${stamp}`,
    address: {
      line1: "100 Market St",
      city: "Philadelphia",
      state: "PA",
      postal_code: "19107",
      country: "US",
    },
  };
  show("clinic POST /patients", await call(clinicBase, "POST", "/patients", patientBody));

  // Order-first RND on VitaClinic (no Rx needed per docs)
  const orderBodies = [
    {
      label: "clinic POST /orders RND PA card_on_file",
      body: {
        billing_mode: "card_on_file",
        external_order_id: `WT-CLINIC-RND-${stamp}`,
        external_patient_id: patientBody.external_patient_id,
        patient: patientBody,
        items: [{ platform_product_id: productId, quantity: 1 }],
        shipping_destination_type: "patient_direct",
        shipping_address: {
          name: `${patientBody.first_name} ${patientBody.last_name}`,
          line1: patientBody.address.line1,
          city: patientBody.address.city,
          state: "PA",
          postal_code: patientBody.address.postal_code,
          country: "US",
        },
      },
    },
    {
      label: "clinic POST /orders with product_id",
      body: {
        billing_mode: "card_on_file",
        external_order_id: `WT-CLINIC-RND2-${stamp}`,
        patient: {
          ...patientBody,
          email: `clinic.pa2+${stamp}@wellnesstechdistribution.com`,
          external_patient_id: `wt-clinic-pa2-${stamp}`,
        },
        lines: [{ product_id: productId, quantity: 1 }],
        items: [{ product_id: productId, quantity: 1 }],
        shipping_address: {
          name: "Clinic Pa2",
          line1: "100 Market St",
          city: "Philadelphia",
          state: "PA",
          postal_code: "19107",
          country: "US",
        },
      },
    },
  ];

  for (const item of orderBodies) {
    show(item.label, await call(clinicBase, "POST", "/orders", item.body));
  }

  // Also try practice /orders with known good patient from WT-2026-0020 remote
  // First fetch that order to get patient_id
  const knownOrderId = "bdb9a992-a6c9-4ffb-b700-231b87807eca";
  show("practice GET known order", await call(practiceBase, "GET", `/orders/${knownOrderId}`));
  const known = await call(practiceBase, "GET", `/orders/${knownOrderId}`);
  const knownPatientId =
    (known.data as { data?: { patient_id?: string } })?.data?.patient_id ||
    (known.data as { patient_id?: string })?.patient_id;
  console.log("knownPatientId", knownPatientId);
  if (knownPatientId) {
    show(
      "practice POST /orders RND PA ship existing patient",
      await call(practiceBase, "POST", "/orders", {
        external_order_id: `WT-PRACTICE-RND-PA-${stamp}`,
        patient_id: knownPatientId,
        items: [{ platform_product_id: productId, quantity: 1 }],
        shipping_destination_type: "patient_direct",
        shipping_address: {
          name: "Jesse Kaufman",
          line1: "100 Market St",
          city: "Philadelphia",
          state: "PA",
          postal_code: "19107",
          country: "US",
        },
      }),
    );
    show(
      "practice POST /orders RND FL ship existing patient",
      await call(practiceBase, "POST", "/orders", {
        external_order_id: `WT-PRACTICE-RND-FL-${stamp}`,
        patient_id: knownPatientId,
        items: [{ platform_product_id: productId, quantity: 1 }],
        shipping_destination_type: "patient_direct",
        shipping_address: {
          name: "Jesse Kaufman",
          line1: "Tempore illo provid",
          city: "Miami",
          state: "FL",
          postal_code: "33101",
          country: "US",
        },
      }),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
