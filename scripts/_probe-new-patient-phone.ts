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
const stamp = Date.now();
const taurine = "b108dc04-25c2-4c5e-b115-4e008e921c36";
const ahk = "119df359-ebf4-4c6a-8084-64cdadac5853";
const miami = { line1: "200 Biscayne Blvd", city: "Miami", state: "FL", postal_code: "33131" };
const pa = { line1: "100 Market St", city: "Philadelphia", state: "PA", postal_code: "19107" };
const flPrescriber = {
  full_name: "Carmen Ramirez",
  npi_number: npi,
  licenses: [{ state: "FL", number: flLic }],
};
const dual = {
  full_name: "Carmen Ramirez",
  npi_number: npi,
  licenses: [
    { state: "FL", number: flLic },
    { state: "PA", number: flLic },
  ],
};

async function post(label: string, body: unknown) {
  const res = await fetch(`${base}/prescriptions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  const d = data as {
    error?: { message?: string; code?: string };
    data?: { order_id?: string; patient_id?: string; payment_status?: string };
  };
  console.log(
    JSON.stringify(
      {
        label,
        ok: res.ok,
        status: res.status,
        err: d.error?.message || null,
        order_id: d.data?.order_id || null,
        patient_id: d.data?.patient_id || null,
      },
      null,
      2,
    ),
  );
  return d.data?.patient_id || "";
}

async function main() {
  // New person, fixed 555 phone that works for Portal Smoke
  const pid1 = await post("new-fixed-555-phone", {
    external_order_id: `WT-NEW555-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: {
      first_name: "Harper",
      last_name: `Quinn${randomInt(10, 99)}`,
      dob: "1994-06-18",
      email: `harper.quinn+${stamp}@gmail.com`,
      phone: "+13055550188",
      address: miami,
    },
    prescriptions: [
      {
        platform_product_id: taurine,
        drug_name: "Taurine (PF) 50mg/mL; 30mL (1,500mg)",
        sig: "As directed",
        order_quantity: 1,
        quantity: 1,
      },
    ],
    shipping_address: { name: "Harper Quinn", ...miami, country: "US" },
    prescriber: flPrescriber,
  });

  // New person, no phone at all
  await post("new-no-phone", {
    external_order_id: `WT-NOPHONE-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: {
      first_name: "Drew",
      last_name: `Foster${randomInt(10, 99)}`,
      dob: "1993-09-21",
      email: `drew.foster+${stamp}@gmail.com`,
      address: miami,
    },
    prescriptions: [
      {
        platform_product_id: taurine,
        drug_name: "Taurine (PF) 50mg/mL; 30mL (1,500mg)",
        sig: "As directed",
        order_quantity: 1,
        quantity: 1,
      },
    ],
    shipping_address: { name: "Drew Foster", ...miami, country: "US" },
    prescriber: flPrescriber,
  });

  // New person, no email
  await post("new-no-email", {
    external_order_id: `WT-NOEMAIL-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: {
      first_name: "Blake",
      last_name: `Hayes${randomInt(10, 99)}`,
      dob: "1989-12-05",
      phone: "+13055550188",
      address: miami,
    },
    prescriptions: [
      {
        platform_product_id: taurine,
        drug_name: "Taurine (PF) 50mg/mL; 30mL (1,500mg)",
        sig: "As directed",
        order_quantity: 1,
        quantity: 1,
      },
    ],
    shipping_address: { name: "Blake Hayes", ...miami, country: "US" },
    prescriber: flPrescriber,
  });

  // Real-looking PA portal order: chart address = ship address = PA, dual licenses
  // Use a name that might already exist from earlier successful PA verifies
  await post("pa-jesse-style", {
    external_order_id: `WT-JESSE-PA-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: {
      first_name: "Jesse",
      last_name: "Kaufman",
      dob: "2013-05-24",
      email: "sevas@mailinator.com",
      phone: "+18658746478",
      address: {
        line1: "Tempore illo provid",
        line2: "Qui magni exercitati",
        city: "Voluptatem iusto mol",
        state: "PA",
        postal_code: "57432",
      },
    },
    prescriptions: [
      {
        platform_product_id: ahk,
        drug_name: "AHK-Cu 20mg",
        sig: "As directed",
        order_quantity: 1,
        quantity: 1,
      },
    ],
    shipping_address: {
      name: "Jesse Kaufman",
      line1: "Tempore illo provid",
      line2: "Qui magni exercitati",
      city: "Voluptatem iusto mol",
      state: "PA",
      postal_code: "57432",
      country: "US",
    },
    prescriber: dual,
  });

  // Workaround: true PA ship-to, but patient.address.state forced FL for chart match/create
  // with REAL new demographics (if create still broken, this fails too)
  await post("new-pa-ship-fl-chart-addr", {
    external_order_id: `WT-FLCHART-PASHIP-NEW-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: {
      first_name: "Casey",
      last_name: `Nguyen${randomInt(10, 99)}`,
      dob: "1990-01-15",
      email: `casey.nguyen+${stamp}@gmail.com`,
      phone: "+13055550188",
      address: miami, // FL chart
    },
    prescriptions: [
      {
        platform_product_id: ahk,
        drug_name: "AHK-Cu 20mg",
        sig: "As directed",
        order_quantity: 1,
        quantity: 1,
      },
    ],
    shipping_address: { name: "Casey Nguyen", ...pa, country: "US" },
    prescriber: dual,
  });

  console.log("pid1", pid1);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
