/**
 * Isolate current "Failed to create patient" — reuse known patient_id, FL smoke, minimal.
 */
import { randomInt } from "crypto";
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
const headers: Record<string, string> = {
  Authorization: `Bearer ${key}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};
if (process.env.EVENTIDE_PLACED_BY_USER_ID) {
  headers["X-User-Id"] = process.env.EVENTIDE_PLACED_BY_USER_ID;
}

const npi = (process.env.EVENTIDE_PRESCRIBER_NPI || "1023022357").replace(/\D/g, "");
const flLic = process.env.EVENTIDE_PRESCRIBER_LICENSE_NUMBER || "84581";
const productId = "b108dc04-25c2-4c5e-b115-4e008e921c36"; // Taurine — known good
const stamp = Date.now();

async function req(method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 600) };
  }
  return { ok: res.ok, status: res.status, data };
}

function summary(label: string, r: { ok: boolean; status: number; data: unknown }) {
  const d = r.data as {
    error?: { code?: string; message?: string };
    data?: { order_id?: string; patient_id?: string; payment_status?: string; status?: string };
  };
  console.log(
    JSON.stringify(
      {
        label,
        ok: r.ok,
        status: r.status,
        err: d.error?.message || null,
        code: d.error?.code || null,
        order_id: d.data?.order_id || null,
        patient_id: d.data?.patient_id || null,
        payment_status: d.data?.payment_status || d.data?.status || null,
      },
      null,
      2,
    ),
  );
  return r;
}

async function main() {
  console.log("key_prefix", key.slice(0, 12), "base", base);

  const oldIds = [
    "3ab825bb-21b1-4217-996c-bd235a6ec270",
    "bdb9a992-288d-4a3a-9b0a-000000000000", // may be wrong — probe list
  ];

  // List recent orders / try known order
  summary("GET /orders?limit=5", await req("GET", "/orders?limit=5"));
  for (const id of ["3ab825bb-21b1-4217-996c-bd235a6ec270"]) {
    summary(`GET /orders/${id}`, await req("GET", `/orders/${id}`));
  }

  const knownOrder = await req("GET", "/orders/3ab825bb-21b1-4217-996c-bd235a6ec270");
  const knownPatientId =
    (knownOrder.data as { data?: { patient_id?: string; patient?: { id?: string } } })?.data
      ?.patient_id ||
    (knownOrder.data as { data?: { patient?: { id?: string } } })?.data?.patient?.id ||
    "";
  console.log("knownPatientId", knownPatientId);

  const miami = { line1: "200 Biscayne Blvd", city: "Miami", state: "FL", postal_code: "33131" };
  const prescriber = {
    full_name: "Carmen Ramirez",
    npi_number: npi,
    licenses: [{ state: "FL", number: flLic }],
  };
  const rx = [
    {
      platform_product_id: productId,
      drug_name: "Taurine (PF) 50mg/mL; 30mL (1,500mg)",
      sig: "As directed",
      order_quantity: 1,
      quantity: 1,
    },
  ];

  // A) Exact known-good Portal Smoke FL
  summary(
    "A-fl-portal-smoke",
    await req("POST", "/prescriptions", {
      external_order_id: `WT-NOW-A-${stamp}`,
      shipping_destination_type: "patient_direct",
      patient: {
        first_name: "Portal",
        last_name: "Smoke",
        dob: "1988-04-12",
        email: `kian.smoke+${stamp}@kianprive.com`,
        phone: "+13055550188",
        external_patient_id: `wt-smoke-${stamp}`,
        address: miami,
      },
      prescriptions: rx,
      shipping_address: { name: "Portal Smoke", ...miami, country: "US" },
      prescriber,
    }),
  );

  // B) Minimal — no email/phone/external
  summary(
    "B-minimal",
    await req("POST", "/prescriptions", {
      external_order_id: `WT-NOW-B-${stamp}`,
      shipping_destination_type: "patient_direct",
      patient: {
        first_name: "Riley",
        last_name: `Brooks${randomInt(10, 99)}`,
        dob: "1985-07-22",
        address: miami,
      },
      prescriptions: rx,
      shipping_address: { name: "Riley Brooks", ...miami, country: "US" },
      prescriber,
    }),
  );

  // C) Reuse patient_id if we have one
  if (knownPatientId) {
    summary(
      "C-reuse-patient_id-prescriptions",
      await req("POST", "/prescriptions", {
        external_order_id: `WT-NOW-C-${stamp}`,
        shipping_destination_type: "patient_direct",
        patient_id: knownPatientId,
        patient: {
          first_name: "Portal",
          last_name: "Smoke",
          dob: "1988-04-12",
          address: miami,
        },
        prescriptions: rx,
        shipping_address: { name: "Portal Smoke", ...miami, country: "US" },
        prescriber,
      }),
    );

    summary(
      "D-orders-with-patient_id",
      await req("POST", "/orders", {
        external_order_id: `WT-NOW-D-${stamp}`,
        shipping_destination_type: "patient_direct",
        patient_id: knownPatientId,
        items: [{ platform_product_id: productId, quantity: 1 }],
        shipping_address: { name: "Portal Smoke", ...miami, country: "US" },
      }),
    );
  }

  // E) PA with dual licenses (the production path)
  summary(
    "E-pa-dual-license",
    await req("POST", "/prescriptions", {
      external_order_id: `WT-NOW-E-${stamp}`,
      shipping_destination_type: "patient_direct",
      patient: {
        first_name: "Portal",
        last_name: "Smoke",
        dob: "1988-04-12",
        email: `portal.pa+${stamp}@wellnesstechdistribution.com`,
        phone: `+1305${randomInt(2000000, 8999999)}`,
        address: {
          line1: "100 Market St",
          city: "Philadelphia",
          state: "PA",
          postal_code: "19107",
        },
      },
      prescriptions: [
        {
          platform_product_id: "119df359-ebf4-4c6a-8084-64cdadac5853",
          drug_name: "AHK-Cu 20mg",
          sig: "As directed",
          order_quantity: 1,
          quantity: 1,
        },
      ],
      shipping_address: {
        name: "Portal Smoke",
        line1: "100 Market St",
        city: "Philadelphia",
        state: "PA",
        postal_code: "19107",
        country: "US",
      },
      prescriber: {
        full_name: "Carmen Ramirez",
        npi_number: npi,
        licenses: [
          { state: "FL", number: flLic },
          { state: "PA", number: flLic },
        ],
      },
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
