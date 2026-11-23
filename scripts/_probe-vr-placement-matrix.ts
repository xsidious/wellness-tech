/**
 * Probe every VitaRelay Practice API path that can make an order land for non-FL states.
 * Prints no secrets.
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
const placer = process.env.EVENTIDE_PLACED_BY_USER_ID || process.env.VITARELAY_PLACED_BY_USER_ID || "";

const headers: Record<string, string> = {
  Authorization: `Bearer ${key}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};
if (placer) headers["X-User-Id"] = placer;

async function call(method: string, path: string, body?: unknown) {
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
    data = { raw: text.slice(0, 800) };
  }
  return { ok: res.ok, status: res.status, data };
}

function summarize(label: string, result: { ok: boolean; status: number; data: unknown }) {
  const err =
    typeof result.data === "object" && result.data && "error" in result.data
      ? (result.data as { error?: unknown }).error
      : undefined;
  console.log(
    JSON.stringify(
      {
        label,
        ok: result.ok,
        status: result.status,
        error: err,
        keys:
          typeof result.data === "object" && result.data
            ? Object.keys(result.data as object)
            : typeof result.data,
        preview: JSON.stringify(result.data).slice(0, 700),
      },
      null,
      2,
    ),
  );
}

async function main() {
const stamp = Date.now();
const productId = "119df359-ebf4-4c6a-8084-64cdadac5853"; // AHK-Cu 20mg RND

console.log("=== account / me / capabilities ===");
for (const path of ["/me", "/account", "/practice", "/capabilities", "/whoami", "/"]) {
  summarize(path, await call("GET", path));
}

console.log("=== prescribers ===");
const roster = await call("GET", "/prescribers");
summarize("GET /prescribers", roster);

console.log("=== routes ===");
for (const state of ["FL", "PA", "TX", "NY", "CA"]) {
  summarize(`prescriber-route ${state}`, await call("GET", `/prescriber-route?state=${state}`));
}

console.log("=== try PATCH/POST add PA license to Carmen ===");
const carmenId = "6dc20a57-3ba4-4ed8-862a-899a59c42765";
const npi = (process.env.EVENTIDE_PRESCRIBER_NPI || "1023022357").replace(/\D/g, "");
const flLic = process.env.EVENTIDE_PRESCRIBER_LICENSE_NUMBER || "84581";

summarize(
  "POST /prescribers upsert Carmen+PA",
  await call("POST", "/prescribers", {
    full_name: process.env.EVENTIDE_PRESCRIBER_NAME || "Carmen Ramirez",
    npi_number: npi,
    license_state: "PA",
    license_number: flLic,
    role: "physician",
  }),
);

summarize(
  "POST /prescribers with licenses array",
  await call("POST", "/prescribers", {
    full_name: "Carmen Ramirez",
    npi_number: npi,
    licenses: [
      { state: "FL", number: flLic },
      { state: "PA", number: flLic },
    ],
  }),
);

for (const path of [
  `/prescribers/${carmenId}`,
  `/prescribers/${carmenId}/licenses`,
]) {
  summarize(
    `POST ${path}`,
    await call("POST", path, {
      state: "PA",
      number: flLic,
      license_state: "PA",
      license_number: flLic,
    }),
  );
  summarize(
    `PATCH ${path}`,
    await call("PATCH", path, {
      state: "PA",
      number: flLic,
      licenses: [
        { state: "FL", number: flLic },
        { state: "PA", number: flLic },
      ],
    }),
  );
}

console.log("=== script-requests variants ===");
const patientPA = {
  first_name: "Matrix",
  last_name: `Probe${String(stamp).slice(-4)}`,
  dob: "1988-04-12",
  email: `matrix.pa+${stamp}@wellnesstechdistribution.com`,
  phone: "+13055550177",
  external_patient_id: `wt-matrix-pa-${stamp}`,
  address: {
    line1: "100 Market St",
    city: "Philadelphia",
    state: "PA",
    postal_code: "19107",
  },
};

const scriptBodies = [
  {
    label: "script-requests baseline",
    body: {
      patient: patientPA,
      provider: {
        external_id: "wt-practice",
        name: "Wellness Tech Distribution",
        kind: "clinic",
        email: "ops@wellnesstechdistribution.com",
      },
      medications: [{ platform_product_id: productId }],
      note: "WT matrix probe — network signing",
    },
  },
  {
    label: "script-requests distributor_office",
    body: {
      patient: patientPA,
      provider: {
        external_id: "wt-distributor",
        name: "Wellness Tech Distribution",
        kind: "tele_clinic",
      },
      medications: [{ platform_product_id: productId }],
      shipping_destination_type: "distributor_office",
      note: "WT matrix probe distributor_office",
    },
  },
  {
    label: "script-requests referring only",
    body: {
      patient: patientPA,
      referring_provider: {
        external_id: "wt-practice",
        name: "Wellness Tech",
        kind: "clinic",
      },
      medications: [{ platform_product_id: productId }],
    },
  },
];

for (const item of scriptBodies) {
  summarize(item.label, await call("POST", "/script-requests", item.body));
}

console.log("=== prescriptions with Carmen FL license for PA patient (known fail) ===");
summarize(
  "prescriptions Carmen→PA",
  await call("POST", "/prescriptions", {
    external_order_id: `WT-MATRIX-PA-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: patientPA,
    prescriptions: [
      {
        platform_product_id: productId,
        drug_name: "AHK-Cu 20mg",
        sig: "As directed",
        order_quantity: 1,
        quantity: 1,
      },
    ],
    shipping_address: {
      name: `${patientPA.first_name} ${patientPA.last_name}`,
      line1: patientPA.address.line1,
      city: patientPA.address.city,
      state: patientPA.address.state,
      postal_code: patientPA.address.postal_code,
      country: "US",
    },
    prescriber: {
      full_name: "Carmen Ramirez",
      npi_number: npi,
      licenses: [{ state: "FL", number: flLic }],
    },
  }),
);

console.log("=== prescriptions PA patient but claim PA license (same FL number) ===");
summarize(
  "prescriptions fake PA license number",
  await call("POST", "/prescriptions", {
    external_order_id: `WT-MATRIX-PA-LIC-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: patientPA,
    prescriptions: [
      {
        platform_product_id: productId,
        drug_name: "AHK-Cu 20mg",
        sig: "As directed",
        order_quantity: 1,
        quantity: 1,
      },
    ],
    shipping_address: {
      name: `${patientPA.first_name} ${patientPA.last_name}`,
      line1: patientPA.address.line1,
      city: patientPA.address.city,
      state: patientPA.address.state,
      postal_code: patientPA.address.postal_code,
      country: "US",
    },
    prescriber: {
      full_name: "Carmen Ramirez",
      npi_number: npi,
      licenses: [{ state: "PA", number: flLic }],
    },
  }),
);

console.log("=== alternate order endpoints ===");
for (const path of ["/orders", "/orders/from-script", "/orders/network", "/fulfillment-orders"]) {
  summarize(
    `POST ${path}`,
    await call("POST", path, {
      external_order_id: `WT-ALT-${path.replace(/\W+/g, "")}-${stamp}`,
      shipping_destination_type: "patient_direct",
      patient: patientPA,
      items: [{ platform_product_id: productId, quantity: 1 }],
      prescriptions: [
        {
          platform_product_id: productId,
          drug_name: "AHK-Cu 20mg",
          sig: "As directed",
          order_quantity: 1,
          quantity: 1,
        },
      ],
      shipping_address: {
        name: "Matrix Probe",
        line1: patientPA.address.line1,
        city: patientPA.address.city,
        state: "PA",
        postal_code: patientPA.address.postal_code,
        country: "US",
      },
      prescriber: {
        full_name: "Carmen Ramirez",
        npi_number: npi,
        licenses: [{ state: "FL", number: flLic }],
      },
    }),
  );
}

console.log("=== FL control (must succeed) ===");
summarize(
  "prescriptions FL control",
  await call("POST", "/prescriptions", {
    external_order_id: `WT-MATRIX-FL-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: {
      ...patientPA,
      email: `matrix.fl+${stamp}@wellnesstechdistribution.com`,
      external_patient_id: `wt-matrix-fl-${stamp}`,
      address: {
        line1: "200 Biscayne Blvd",
        city: "Miami",
        state: "FL",
        postal_code: "33131",
      },
    },
    prescriptions: [
      {
        platform_product_id: productId,
        drug_name: "AHK-Cu 20mg",
        sig: "As directed",
        order_quantity: 1,
        quantity: 1,
      },
    ],
    shipping_address: {
      name: "Matrix FL",
      line1: "200 Biscayne Blvd",
      city: "Miami",
      state: "FL",
      postal_code: "33131",
      country: "US",
    },
    prescriber: {
      full_name: "Carmen Ramirez",
      npi_number: npi,
      licenses: [{ state: "FL", number: flLic }],
    },
  }),
);
