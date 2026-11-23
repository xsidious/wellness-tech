/**
 * Isolate why Eventide Practice API fails creating NEW patients.
 * Prints exact status + error body for each variant.
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
const headers = {
  Authorization: `Bearer ${key}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};
if (process.env.EVENTIDE_PLACED_BY_USER_ID) headers["X-User-Id"] = process.env.EVENTIDE_PLACED_BY_USER_ID;

const stamp = Date.now();
const productId = "b108dc04-25c2-4c5e-b115-4e008e921c36";
const npi = (process.env.EVENTIDE_PRESCRIBER_NPI || "1023022357").replace(/\D/g, "");
const license = {
  state: process.env.EVENTIDE_PRESCRIBER_LICENSE_STATE || "FL",
  number: process.env.EVENTIDE_PRESCRIBER_LICENSE_NUMBER || "84581",
};
const prescriber = {
  full_name: process.env.EVENTIDE_PRESCRIBER_NAME || "Carmen Ramirez",
  npi_number: npi,
  licenses: [license],
};

function rx(drug = "Taurine (PF) 50mg/mL; 30mL (1,500mg)") {
  return [
    {
      platform_product_id: productId,
      drug_name: drug,
      sig: "As directed — patient create diagnose",
      order_quantity: 1,
      quantity: 1,
    },
  ];
}

function ship(name, addr) {
  return {
    name,
    line1: addr.line1,
    line2: addr.line2,
    city: addr.city,
    state: addr.state,
    postal_code: addr.postal_code,
    country: "US",
  };
}

async function place(label, patient, extras = {}) {
  const body = {
    external_order_id: `WT-PAT-${label}-${stamp}`.slice(0, 64),
    shipping_destination_type: "patient_direct",
    patient,
    prescriptions: rx(),
    shipping_address: ship(`${patient.first_name} ${patient.last_name}`, patient.address),
    prescriber,
    ...extras,
  };
  const res = await fetch(`${base}/prescriptions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 800) };
  }
  const err = data?.error || null;
  const okData = data?.data || null;
  console.log(
    JSON.stringify(
      {
        label,
        http: res.status,
        ok: res.ok,
        error_code: err?.code || null,
        error_message: err?.message || (res.ok ? null : JSON.stringify(data).slice(0, 400)),
        patient_id: okData?.patient_id || null,
        order_id: okData?.order_id || null,
        order_number: okData?.order_number || null,
        payment_status: okData?.payment_status || null,
        payment_message: okData?.payment_message || null,
        sandbox: okData?.sandbox ?? null,
        request_patient: {
          first_name: patient.first_name,
          last_name: patient.last_name,
          dob: patient.dob,
          email: patient.email,
          phone: patient.phone,
          external_patient_id: patient.external_patient_id,
          address: patient.address,
        },
      },
      null,
      2,
    ),
  );
  return { res, data };
}

const miami = { line1: "200 Biscayne Blvd", city: "Miami", state: "FL", postal_code: "33131" };
const hollywood = { line1: "1731 Plunkett St", city: "Hollywood", state: "FL", postal_code: "33020" };

// A) Exact known-good demographics (previously succeeded / reused patient)
await place("reuse-portal-smoke", {
  first_name: "Portal",
  last_name: "Smoke",
  dob: "1988-04-12",
  email: `kian.smoke+${stamp}@kianprive.com`,
  phone: "+13055550188",
  external_patient_id: `reuse-${stamp}`,
  address: miami,
});

// B) Brand-new person, same address as good case
await place("new-person-miami", {
  first_name: "Jordan",
  last_name: "Ellis",
  dob: "1992-11-03",
  email: `jordan.ellis+${stamp}@kianprive.com`,
  phone: "+13055550188",
  external_patient_id: `jordan-${stamp}`,
  address: miami,
});

// C) Brand-new person, Alycia-style Hollywood address that was used before
await place("new-person-hollywood", {
  first_name: "Casey",
  last_name: "Nguyen",
  dob: "1990-01-15",
  email: `casey.nguyen+${stamp}@gmail.com`,
  phone: "+13055550199",
  external_patient_id: `casey-${stamp}`,
  address: hollywood,
});

// D) Minimal patient (no email/phone/external id)
await place("minimal-no-contact", {
  first_name: "Riley",
  last_name: "Brooks",
  dob: "1985-07-22",
  address: miami,
});

// E) Phone formats
await place("phone-digits-only", {
  first_name: "Morgan",
  last_name: "Lee",
  dob: "1987-03-09",
  email: `morgan.lee+${stamp}@kianprive.com`,
  phone: "3055550188",
  external_patient_id: `morgan-${stamp}`,
  address: miami,
});

await place("phone-dashed", {
  first_name: "Taylor",
  last_name: "Reed",
  dob: "1986-08-19",
  email: `taylor.reed+${stamp}@kianprive.com`,
  phone: "(305) 555-0188",
  external_patient_id: `taylor-${stamp}`,
  address: miami,
});

// F) DOB formats
await place("dob-slash", {
  first_name: "Avery",
  last_name: "Patel",
  dob: "04/12/1988",
  email: `avery.patel+${stamp}@kianprive.com`,
  phone: "+13055550188",
  external_patient_id: `avery-${stamp}`,
  address: miami,
});

// G) Unique external_patient_id only, reuse name but different dob (force new)
await place("new-dob-same-name", {
  first_name: "Portal",
  last_name: "Smoke",
  dob: "1975-12-01",
  email: `portal.smoke.newdob+${stamp}@kianprive.com`,
  phone: "+13055550188",
  external_patient_id: `portal-newdob-${stamp}`,
  address: miami,
});

// H) Practice office ship instead of patient_direct
await place(
  "practice-office-ship",
  {
    first_name: "Quinn",
    last_name: "Baker",
    dob: "1993-05-05",
    email: `quinn.baker+${stamp}@kianprive.com`,
    phone: "+13055550177",
    external_patient_id: `quinn-${stamp}`,
    address: miami,
  },
  { shipping_destination_type: "practice_office" },
);

// I) Try public v1 create patient if it exists
for (const path of ["/patients", "/patient"]) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      first_name: "Sam",
      last_name: "Rivera",
      dob: "1991-02-02",
      email: `sam.rivera+${stamp}@kianprive.com`,
      phone: "+13055550166",
      address: miami,
    }),
  });
  console.log(
    JSON.stringify({
      label: `direct-create${path}`,
      http: res.status,
      body: (await res.text()).slice(0, 500),
    }),
  );
}
