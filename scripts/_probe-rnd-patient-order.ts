/**
 * 1) Create patient somehow
 * 2) Place RND via POST /orders without MD for PA
 * 3) Try POST /prescriptions with fallback:network
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
const placer = process.env.EVENTIDE_PLACED_BY_USER_ID || "";
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
        dataKeys:
          typeof r.data === "object" && r.data && "data" in (r.data as object)
            ? Object.keys(((r.data as { data?: object }).data || {}) as object)
            : undefined,
        preview: JSON.stringify(r.data).slice(0, 900),
      },
      null,
      2,
    ),
  );
}

async function main() {
  const stamp = Date.now();
  const productId = "119df359-ebf4-4c6a-8084-64cdadac5853";
  const npi = (process.env.EVENTIDE_PRESCRIBER_NPI || "1023022357").replace(/\D/g, "");
  const flLic = process.env.EVENTIDE_PRESCRIBER_LICENSE_NUMBER || "84581";
  const externalPatientId = `wt-rnd-pa-patient-${stamp}`;

  const patient = {
    first_name: "Rnd",
    last_name: `Order${String(stamp).slice(-4)}`,
    dob: "1988-04-12",
    email: `rnd.order+${stamp}@wellnesstechdistribution.com`,
    phone: "+13055550155",
    external_patient_id: externalPatientId,
    address: {
      line1: "100 Market St",
      city: "Philadelphia",
      state: "PA",
      postal_code: "19107",
    },
  };

  console.log("=== patient create endpoints ===");
  for (const path of ["/patients", "/patient", "/customers", "/charts"]) {
    show(
      `POST ${path}`,
      await call("POST", path, {
        ...patient,
        firstName: patient.first_name,
        lastName: patient.last_name,
        dateOfBirth: patient.dob,
      }),
    );
  }

  console.log("=== create patient via FL /prescriptions (Carmen), then /orders RND for same external_patient_id with PA ship? ===");
  // First create patient under FL so Carmen can chart them
  const flPatient = {
    ...patient,
    email: `rnd.flchart+${stamp}@wellnesstechdistribution.com`,
    external_patient_id: `wt-rnd-flchart-${stamp}`,
    address: {
      line1: "200 Biscayne Blvd",
      city: "Miami",
      state: "FL",
      postal_code: "33131",
    },
  };
  const chart = await call("POST", "/prescriptions", {
    external_order_id: `WT-RND-CHART-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: flPatient,
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
      name: `${flPatient.first_name} ${flPatient.last_name}`,
      line1: flPatient.address.line1,
      city: flPatient.address.city,
      state: "FL",
      postal_code: flPatient.address.postal_code,
      country: "US",
    },
    prescriber: {
      full_name: "Carmen Ramirez",
      npi_number: npi,
      licenses: [{ state: "FL", number: flLic }],
    },
  });
  show("chart patient via FL prescriptions", chart);
  const patientId =
    (chart.data as { data?: { patient_id?: string } })?.data?.patient_id ||
    (chart.data as { patient_id?: string })?.patient_id;

  if (patientId) {
    show(
      "POST /orders RND using patient_id only (PA shipping)",
      await call("POST", "/orders", {
        external_order_id: `WT-RND-PA-ORD-${stamp}`,
        patient_id: patientId,
        shipping_destination_type: "patient_direct",
        items: [{ platform_product_id: productId, quantity: 1 }],
        shipping_address: {
          name: `${patient.first_name} ${patient.last_name}`,
          line1: patient.address.line1,
          city: patient.address.city,
          state: "PA",
          postal_code: patient.address.postal_code,
          country: "US",
        },
      }),
    );
  }

  console.log("=== /orders with external_patient_id after chart ===");
  show(
    "POST /orders external_patient_id from FL chart",
    await call("POST", "/orders", {
      external_order_id: `WT-RND-EXT-${stamp}`,
      external_patient_id: flPatient.external_patient_id,
      shipping_destination_type: "patient_direct",
      items: [{ platform_product_id: productId, quantity: 1 }],
      shipping_address: {
        name: `${patient.first_name} ${patient.last_name}`,
        line1: patient.address.line1,
        city: patient.address.city,
        state: "PA",
        postal_code: patient.address.postal_code,
        country: "US",
      },
    }),
  );

  console.log("=== prescriptions fallback network for PA ===");
  show(
    "fallback network no MD",
    await call("POST", "/prescriptions", {
      external_order_id: `WT-RND-NET-${stamp}`,
      shipping_destination_type: "patient_direct",
      fallback: "network",
      patient,
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
        name: `${patient.first_name} ${patient.last_name}`,
        line1: patient.address.line1,
        city: patient.address.city,
        state: "PA",
        postal_code: patient.address.postal_code,
        country: "US",
      },
      provider: {
        external_id: "wt-practice",
        name: "Wellness Tech Distribution",
        kind: "clinic",
        email: "ops@wellnesstechdistribution.com",
      },
    }),
  );

  show(
    "fallback network + Carmen unlicensed PA",
    await call("POST", "/prescriptions", {
      external_order_id: `WT-RND-NET2-${stamp}`,
      shipping_destination_type: "patient_direct",
      fallback: "network",
      patient: {
        ...patient,
        email: `rnd.net2+${stamp}@wellnesstechdistribution.com`,
        external_patient_id: `wt-rnd-net2-${stamp}`,
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
        name: `${patient.first_name} ${patient.last_name}`,
        line1: patient.address.line1,
        city: patient.address.city,
        state: "PA",
        postal_code: patient.address.postal_code,
        country: "US",
      },
      prescriber: {
        full_name: "Carmen Ramirez",
        npi_number: npi,
        licenses: [{ state: "FL", number: flLic }],
      },
      provider: {
        external_id: "wt-practice",
        name: "Wellness Tech Distribution",
        kind: "clinic",
      },
    }),
  );

  // Also try RND /orders for a freshly charted FL patient shipping FL (control)
  if (patientId) {
    show(
      "POST /orders second RND line same patient FL ship",
      await call("POST", "/orders", {
        external_order_id: `WT-RND-FL2-${stamp}`,
        patient_id: patientId,
        shipping_destination_type: "patient_direct",
        items: [{ platform_product_id: productId, quantity: 1 }],
        shipping_address: {
          name: `${flPatient.first_name} ${flPatient.last_name}`,
          line1: flPatient.address.line1,
          city: flPatient.address.city,
          state: "FL",
          postal_code: flPatient.address.postal_code,
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
