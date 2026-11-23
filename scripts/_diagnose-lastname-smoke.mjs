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
const headers = {
  Authorization: `Bearer ${key}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};
if (process.env.EVENTIDE_PLACED_BY_USER_ID) headers["X-User-Id"] = process.env.EVENTIDE_PLACED_BY_USER_ID;

const stamp = Date.now();
const productId = "b108dc04-25c2-4c5e-b115-4e008e921c36";
const npi = (process.env.EVENTIDE_PRESCRIBER_NPI || "1023022357").replace(/\D/g, "");
const miami = { line1: "200 Biscayne Blvd", city: "Miami", state: "FL", postal_code: "33131" };

async function place(label, first, last) {
  const body = {
    external_order_id: `WT-LN-${label}-${stamp}`.slice(0, 64),
    shipping_destination_type: "patient_direct",
    patient: {
      first_name: first,
      last_name: last,
      dob: "1988-04-12",
      email: `${label}.${stamp}@kianprive.com`,
      phone: "+13055550188",
      external_patient_id: `${label}-${stamp}`,
      address: miami,
    },
    prescriptions: [
      {
        platform_product_id: productId,
        drug_name: "Taurine (PF) 50mg/mL; 30mL (1,500mg)",
        sig: "As directed",
        order_quantity: 1,
        quantity: 1,
      },
    ],
    shipping_address: {
      name: `${first} ${last}`,
      line1: miami.line1,
      city: miami.city,
      state: miami.state,
      postal_code: miami.postal_code,
      country: "US",
    },
    prescriber: {
      full_name: "Carmen Ramirez",
      npi_number: npi,
      licenses: [
        {
          state: process.env.EVENTIDE_PRESCRIBER_LICENSE_STATE || "FL",
          number: process.env.EVENTIDE_PRESCRIBER_LICENSE_NUMBER || "84581",
        },
      ],
    },
  };
  const res = await fetch(`${base}/prescriptions`, { method: "POST", headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  console.log(
    JSON.stringify({
      label,
      last_name: last,
      http: res.status,
      code: data?.error?.code || null,
      message: data?.error?.message || null,
      patient_id: data?.data?.patient_id || null,
      order_number: data?.data?.order_number || null,
    }),
  );
}

const tests = [
  ["smoke-1", "Alice", "Smoke"],
  ["smoke-2", "Bob", "Smoke"],
  ["smoke-3", "Chris", "Smoke"],
  ["smoke-lower", "Dana", "smoke"],
  ["smok", "Eve", "Smok"],
  ["smokes", "Frank", "Smokes"],
  ["smith", "Grace", "Smith"],
  ["jones", "Hank", "Jones"],
];

for (const [label, first, last] of tests) {
  await place(label, first, last);
  await new Promise((r) => setTimeout(r, 300));
}
