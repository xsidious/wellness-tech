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

async function post(path, body) {
  const res = await fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, text: text.slice(0, 1200) };
}

async function get(path) {
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(process.env.EVENTIDE_PLACED_BY_USER_ID ? { "X-User-Id": process.env.EVENTIDE_PLACED_BY_USER_ID } : {}) } });
  return { status: res.status, text: (await res.text()).slice(0, 800) };
}

const stamp = Date.now();
const productId = "b108dc04-25c2-4c5e-b115-4e008e921c36";
const npi = (process.env.EVENTIDE_PRESCRIBER_NPI || "1023022357").replace(/\D/g, "");
const license = {
  state: process.env.EVENTIDE_PRESCRIBER_LICENSE_STATE || "FL",
  number: process.env.EVENTIDE_PRESCRIBER_LICENSE_NUMBER || "84581",
};

// Confirm old order still readable
console.log("OLD", await get("/orders/3ab825bb-21b1-4217-996c-bd235a6ec270"));
console.log("PRESCRIBERS", await get("/prescribers"));

const variants = [
  {
    name: "clone_successful_smoke",
    body: {
      external_order_id: `WT-CLONE-${stamp}`,
      shipping_destination_type: "patient_direct",
      patient: {
        first_name: "Portal",
        last_name: "Smoke",
        dob: "1988-04-12",
        email: `kian.smoke+${stamp}@kianprive.com`,
        phone: "+13055550188",
        external_patient_id: `wt-smoke-${stamp}`,
        address: { line1: "200 Biscayne Blvd", city: "Miami", state: "FL", postal_code: "33131" },
      },
      prescriptions: [
        {
          platform_product_id: productId,
          drug_name: "Taurine (PF) 50mg/mL; 30mL (1,500mg)",
          sig: "As directed — clone smoke",
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
        full_name: "Carmen Ramirez",
        npi_number: npi,
        licenses: [license],
      },
    },
  },
  {
    name: "with_gender_sex",
    body: {
      external_order_id: `WT-GENDER-${stamp}`,
      shipping_destination_type: "patient_direct",
      patient: {
        first_name: "Alex",
        last_name: "Tester",
        dob: "1988-04-12",
        sex: "female",
        gender: "female",
        email: `alex.tester+${stamp}@gmail.com`,
        phone: "3055550188",
        address: { line1: "1731 Plunkett St", city: "Hollywood", state: "FL", postal_code: "33020" },
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
        name: "Alex Tester",
        line1: "1731 Plunkett St",
        city: "Hollywood",
        state: "FL",
        postal_code: "33020",
        country: "US",
      },
      prescriber: {
        full_name: "Carmen Ramirez",
        npi_number: npi,
        licenses: [license],
      },
    },
  },
  {
    name: "orders_endpoint_not_prescriptions",
    path: "/orders",
    body: {
      external_order_id: `WT-ORDERS-${stamp}`,
      shipping_destination_type: "patient_direct",
      patient: {
        first_name: "Order",
        last_name: "Path",
        dob: "1988-04-12",
        email: `order.path+${stamp}@kianprive.com`,
        phone: "+13055550188",
        address: { line1: "200 Biscayne Blvd", city: "Miami", state: "FL", postal_code: "33131" },
      },
      items: [{ platform_product_id: productId, quantity: 1 }],
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
        name: "Order Path",
        line1: "200 Biscayne Blvd",
        city: "Miami",
        state: "FL",
        postal_code: "33131",
        country: "US",
      },
      prescriber: {
        full_name: "Carmen Ramirez",
        npi_number: npi,
        licenses: [license],
      },
      prescriber_npi: npi,
    },
  },
];

for (const v of variants) {
  const r = await post(v.path || "/prescriptions", v.body);
  console.log(JSON.stringify({ variant: v.name, status: r.status, body: r.text }, null, 2));
}
