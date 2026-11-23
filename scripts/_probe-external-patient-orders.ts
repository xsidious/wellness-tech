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
const knownPid = "7cb3194e-5bcc-49d3-acd9-9aad29cc7334";
const ahk = "119df359-ebf4-4c6a-8084-64cdadac5853";
const taurine = "b108dc04-25c2-4c5e-b115-4e008e921c36";
const miami = { line1: "200 Biscayne Blvd", city: "Miami", state: "FL", postal_code: "33131" };
const pa = { line1: "100 Market St", city: "Philadelphia", state: "PA", postal_code: "19107" };

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
    data?: Record<string, unknown>;
  };
  console.log(
    JSON.stringify(
      {
        path,
        ext: (body as { external_order_id?: string }).external_order_id,
        ok: res.ok,
        status: res.status,
        err: d.error?.message || null,
        code: d.error?.code || null,
        order_id: d.data?.order_id || null,
        patient_id: d.data?.patient_id || null,
        payment_status: d.data?.payment_status || null,
        keys: d.data ? Object.keys(d.data) : [],
      },
      null,
      2,
    ),
  );
  return { ok: res.ok, data };
}

async function main() {
  // A) /orders with external_patient_id that matches prior smoke external id?
  await post("/orders", {
    external_order_id: `WT-EXT-ORD-${stamp}`,
    shipping_destination_type: "patient_direct",
    external_patient_id: `wt-smoke-${stamp}`, // new — should fail?
    items: [{ platform_product_id: taurine, quantity: 1 }],
    shipping_address: { name: "Portal Smoke", ...miami, country: "US" },
  });

  // B) /orders patient_id only (known) — PA ship, clean body
  await post("/orders", {
    external_order_id: `WT-PID-ORD-PA-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient_id: knownPid,
    items: [{ platform_product_id: ahk, quantity: 1 }],
    shipping_address: { name: "Portal Smoke", ...pa, country: "US" },
  });

  // C) prescriptions: PA patient address but SAME phone/email as existing — still fail?
  await post("/prescriptions", {
    external_order_id: `WT-PA-SAMEPHONE-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: {
      first_name: "Portal",
      last_name: "Smoke",
      dob: "1988-04-12",
      email: "kian.smoke@kianprive.com",
      phone: "+13055550188",
      address: pa,
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
    shipping_address: { name: "Portal Smoke", ...pa, country: "US" },
    prescriber: {
      full_name: "Carmen Ramirez",
      npi_number: npi,
      licenses: [
        { state: "FL", number: flLic },
        { state: "PA", number: flLic },
      ],
    },
  });

  // D) New patient FL — try WITHOUT external_patient_id, with sex
  await post("/prescriptions", {
    external_order_id: `WT-NEW-SEX-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: {
      first_name: "Morgan",
      last_name: `Lee${randomInt(10, 99)}`,
      dob: "1987-03-09",
      sex: "female",
      email: `morgan.lee+${stamp}@gmail.com`,
      phone: `+1305${randomInt(2000000, 8999999)}`,
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
    shipping_address: { name: "Morgan Lee", ...miami, country: "US" },
    prescriber: {
      full_name: "Carmen Ramirez",
      npi_number: npi,
      licenses: [{ state: "FL", number: flLic }],
    },
  });

  // E) Retry PA placement the WORKING way: FL patient chart + PA ship + dual license
  //    for a "new" identity that we first create as FL... still can't create new.
  //    So simulate real portal: use unique name but if create fails, fall back?
  //    First confirm PA ship with FL chart still works for 503A:
  await post("/prescriptions", {
    external_order_id: `WT-CONFIRM-PASHIP-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: {
      first_name: "Portal",
      last_name: "Smoke",
      dob: "1988-04-12",
      phone: "+13055550188",
      address: miami,
    },
    prescriptions: [
      {
        platform_product_id: ahk,
        drug_name: "AHK-Cu 20mg",
        sig: "As directed — confirm PA ship",
        order_quantity: 1,
        quantity: 1,
      },
    ],
    shipping_address: { name: "Portal Smoke", ...pa, country: "US" },
    prescriber: {
      full_name: "Carmen Ramirez",
      npi_number: npi,
      licenses: [
        { state: "FL", number: flLic },
        { state: "PA", number: flLic },
      ],
    },
  });
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
