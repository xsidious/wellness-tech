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
const patientId = "7cb3194e-5bcc-49d3-acd9-9aad29cc7334";
const ahk = "119df359-ebf4-4c6a-8084-64cdadac5853";
const taurine = "b108dc04-25c2-4c5e-b115-4e008e921c36";

async function post(path: string, body: unknown) {
  const res = await fetch(`${base}${path}`, {
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
        path,
        label: (body as { external_order_id?: string }).external_order_id,
        ok: res.ok,
        status: res.status,
        err: d.error?.message || null,
        code: d.error?.code || null,
        order_id: d.data?.order_id || null,
        patient_id: d.data?.patient_id || null,
        payment_status: d.data?.payment_status || null,
      },
      null,
      2,
    ),
  );
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  const paAddr = {
    line1: "100 Market St",
    city: "Philadelphia",
    state: "PA",
    postal_code: "19107",
  };
  const miami = { line1: "200 Biscayne Blvd", city: "Miami", state: "FL", postal_code: "33131" };
  const dual = {
    full_name: "Carmen Ramirez",
    npi_number: npi,
    licenses: [
      { state: "FL", number: flLic },
      { state: "PA", number: flLic },
    ],
  };
  const flOnly = {
    full_name: "Carmen Ramirez",
    npi_number: npi,
    licenses: [{ state: "FL", number: flLic }],
  };

  // 1) PA with known patient_id + dual licenses
  await post("/prescriptions", {
    external_order_id: `WT-REUSE-PA-RX-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient_id: patientId,
    patient: {
      first_name: "Portal",
      last_name: "Smoke",
      dob: "1988-04-12",
      address: paAddr,
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
    shipping_address: { name: "Portal Smoke", ...paAddr, country: "US" },
    prescriber: dual,
  });

  // 2) /orders with known patient_id shipping to PA (RND-style)
  await post("/orders", {
    external_order_id: `WT-REUSE-PA-ORD-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient_id: patientId,
    items: [{ platform_product_id: ahk, quantity: 1 }],
    shipping_address: { name: "Portal Smoke", ...paAddr, country: "US" },
  });

  // 3) New FL person with FULL contact (not minimal)
  const phone = `+1305${randomInt(2000000, 8999999)}`;
  await post("/prescriptions", {
    external_order_id: `WT-NEW-FL-FULL-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: {
      first_name: "Jordan",
      last_name: `Ellis${randomInt(10, 99)}`,
      dob: "1992-11-03",
      email: `jordan.ellis+${stamp}@gmail.com`,
      phone,
      external_patient_id: `jordan-${stamp}`,
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
    shipping_address: { name: "Jordan Ellis", ...miami, country: "US" },
    prescriber: flOnly,
  });

  // 4) Portal Smoke PA — same identity as known patient (match by name+dob), new ship-to
  await post("/prescriptions", {
    external_order_id: `WT-SMOKE-PA-MATCH-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: {
      first_name: "Portal",
      last_name: "Smoke",
      dob: "1988-04-12",
      email: `kian.smoke+match${stamp}@kianprive.com`,
      phone: "+13055550188",
      external_patient_id: `reuse-match-${stamp}`,
      address: paAddr,
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
    shipping_address: { name: "Portal Smoke", ...paAddr, country: "US" },
    prescriber: dual,
  });

  // 5) New PA person with full contact + dual licenses
  await post("/prescriptions", {
    external_order_id: `WT-NEW-PA-FULL-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: {
      first_name: "Casey",
      last_name: `Nguyen${randomInt(10, 99)}`,
      dob: "1990-01-15",
      email: `casey.nguyen+${stamp}@gmail.com`,
      phone: `+1215${randomInt(2000000, 8999999)}`,
      address: paAddr,
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
    shipping_address: { name: "Casey Nguyen", ...paAddr, country: "US" },
    prescriber: dual,
  });

  // 6) Same Portal Smoke FL again (control — should 201)
  await post("/prescriptions", {
    external_order_id: `WT-SMOKE-FL-CTRL-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: {
      first_name: "Portal",
      last_name: "Smoke",
      dob: "1988-04-12",
      email: `kian.smoke+ctrl${stamp}@kianprive.com`,
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
    shipping_address: { name: "Portal Smoke", ...miami, country: "US" },
    prescriber: flOnly,
  });
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
