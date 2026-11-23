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

async function call(method: string, path: string, body?: unknown) {
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
    data = { raw: text.slice(0, 800) };
  }
  const d = data as {
    error?: { message?: string; code?: string };
    data?: { order_id?: string; patient_id?: string; payment_status?: string };
  };
  console.log(
    JSON.stringify(
      {
        method,
        path,
        ok: res.ok,
        status: res.status,
        err: d.error?.message || (res.ok ? null : JSON.stringify(data).slice(0, 300)),
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
  const miami = { line1: "200 Biscayne Blvd", city: "Miami", state: "FL", postal_code: "33131" };
  const pa = { line1: "100 Market St", city: "Philadelphia", state: "PA", postal_code: "19107" };
  const dual = {
    full_name: "Carmen Ramirez",
    npi_number: npi,
    licenses: [
      { state: "FL", number: flLic },
      { state: "PA", number: flLic },
    ],
  };

  // Search patients
  for (const p of [
    "/patients",
    "/patients?limit=5",
    "/patients?search=Portal",
    "/patient",
  ]) {
    await call("GET", p);
  }

  // Patient FL chart, ship PA — dual licenses (match existing smoke)
  await call("POST", "/prescriptions", {
    external_order_id: `WT-FLPAT-PASHIP-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: {
      first_name: "Portal",
      last_name: "Smoke",
      dob: "1988-04-12",
      email: `kian.smoke+flpat${stamp}@kianprive.com`,
      phone: "+13055550188",
      address: miami,
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
    prescriber: dual,
  });

  // New person: create via FL prescriptions first, then PA via /orders
  const first = `Alex${randomInt(10, 99)}`;
  const last = `Rivera${randomInt(10, 99)}`;
  const phone = `+1305${randomInt(2000000, 8999999)}`;
  const email = `alex.rivera+${stamp}@gmail.com`;
  const create = await call("POST", "/prescriptions", {
    external_order_id: `WT-BOOT-FL-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: {
      first_name: first,
      last_name: last,
      dob: "1991-02-02",
      email,
      phone,
      address: miami,
    },
    prescriptions: [
      {
        platform_product_id: taurine,
        drug_name: "Taurine (PF) 50mg/mL; 30mL (1,500mg)",
        sig: "As directed — bootstrap",
        order_quantity: 1,
        quantity: 1,
      },
    ],
    shipping_address: { name: `${first} ${last}`, ...miami, country: "US" },
    prescriber: {
      full_name: "Carmen Ramirez",
      npi_number: npi,
      licenses: [{ state: "FL", number: flLic }],
    },
  });

  const newPid =
    (create.data as { data?: { patient_id?: string } })?.data?.patient_id || "";
  console.log("bootstrapped_patient_id", newPid);

  if (newPid) {
    await call("POST", "/orders", {
      external_order_id: `WT-BOOT-PA-ORD-${stamp}`,
      shipping_destination_type: "patient_direct",
      patient_id: newPid,
      items: [{ platform_product_id: ahk, quantity: 1 }],
      shipping_address: { name: `${first} ${last}`, ...pa, country: "US" },
    });

    // Can we place 503A PA via prescriptions with matching identity after FL bootstrap?
    await call("POST", "/prescriptions", {
      external_order_id: `WT-BOOT-PA-RX-${stamp}`,
      shipping_destination_type: "patient_direct",
      patient: {
        first_name: first,
        last_name: last,
        dob: "1991-02-02",
        email,
        phone,
        address: miami, // keep FL chart
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
      shipping_address: { name: `${first} ${last}`, ...pa, country: "US" },
      prescriber: dual,
    });
  }

  // /orders without patient_id — can it create?
  await call("POST", "/orders", {
    external_order_id: `WT-ORD-CREATE-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: {
      first_name: "Sam",
      last_name: `Lee${randomInt(10, 99)}`,
      dob: "1988-04-12",
      email: `sam.lee+${stamp}@gmail.com`,
      phone: `+1305${randomInt(2000000, 8999999)}`,
      address: miami,
    },
    items: [{ platform_product_id: taurine, quantity: 1 }],
    shipping_address: { name: "Sam Lee", ...miami, country: "US" },
  });

  // Existing patient_id + PA ship prescriptions? already know patient_id rejected.
  // Try /orders with patient_id for 503A product (already worked for AHK)
  await call("POST", "/orders", {
    external_order_id: `WT-ORD-PA-EXISTING-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient_id: patientId,
    items: [{ platform_product_id: ahk, quantity: 1 }],
    shipping_address: { name: "Portal Smoke", ...pa, country: "US" },
    referring_provider: {
      full_name: "Carmen Ramirez",
      npi_number: npi,
    },
  });
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
