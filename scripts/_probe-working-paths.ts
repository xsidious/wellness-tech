/**
 * Find working placement paths for hybrid practice account.
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
const practice = (
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
  const res = await fetch(`${practice}${path}`, {
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
    data = { raw: text.slice(0, 1000) };
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
        preview: JSON.stringify(r.data).slice(0, 1100),
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

  // Known-good FL smoke patient (worked in place-live-eventide-order)
  const flPatient = {
    first_name: "Portal",
    last_name: "Smoke",
    dob: "1988-04-12",
    email: `portal.smoke+${stamp}@wellnesstechdistribution.com`,
    phone: `+1305555${String(stamp).slice(-4)}`,
    external_patient_id: `wt-work-fl-${stamp}`,
    address: {
      line1: "200 Biscayne Blvd",
      city: "Miami",
      state: "FL",
      postal_code: "33131",
    },
  };

  show(
    "FL RND via /prescriptions Carmen",
    await call("POST", "/prescriptions", {
      external_order_id: `WT-WORK-FL-${stamp}`,
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
        licenses: [{ state: "FL", number: flLic }],
      },
    }),
  );

  // PA with fallback:network WITHOUT provider
  const paPatient = {
    first_name: "Portal",
    last_name: "Network",
    dob: "1988-04-12",
    email: `portal.net+${stamp}@wellnesstechdistribution.com`,
    phone: `+1305556${String(stamp).slice(-4)}`,
    external_patient_id: `wt-work-pa-${stamp}`,
    address: {
      line1: "100 Market St",
      city: "Philadelphia",
      state: "PA",
      postal_code: "19107",
    },
  };

  show(
    "PA RND fallback network no provider no MD",
    await call("POST", "/prescriptions", {
      external_order_id: `WT-WORK-PA-NET-${stamp}`,
      shipping_destination_type: "patient_direct",
      fallback: "network",
      patient: paPatient,
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
        name: "Portal Network",
        line1: "100 Market St",
        city: "Philadelphia",
        state: "PA",
        postal_code: "19107",
        country: "US",
      },
    }),
  );

  show(
    "PA RND fallback network + Carmen FL license",
    await call("POST", "/prescriptions", {
      external_order_id: `WT-WORK-PA-NET2-${stamp}`,
      shipping_destination_type: "patient_direct",
      fallback: "network",
      patient: {
        ...paPatient,
        email: `portal.net2+${stamp}@wellnesstechdistribution.com`,
        external_patient_id: `wt-work-pa2-${stamp}`,
        phone: `+1305557${String(stamp).slice(-4)}`,
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
        name: "Portal Network",
        line1: "100 Market St",
        city: "Philadelphia",
        state: "PA",
        postal_code: "19107",
        country: "US",
      },
      prescriber: {
        full_name: "Carmen Ramirez",
        npi_number: npi,
        licenses: [{ state: "FL", number: flLic }],
      },
    }),
  );

  // After FL success, try /orders with returned patient_id for another RND
  // Also list patients endpoints
  for (const path of ["/patients?limit=5", "/orders?limit=3", "/prescribers"]) {
    show(`GET ${path}`, await call("GET", path));
  }

  // 503A product known from sim: Taurine
  const taurine = "b108dc04-25c2-4c5e-b115-4e008e921c36";
  show("GET catalog taurine", await call("GET", `/catalog/${taurine}`));

  show(
    "PA 503A fallback network + Carmen",
    await call("POST", "/prescriptions", {
      external_order_id: `WT-WORK-PA-503A-${stamp}`,
      shipping_destination_type: "patient_direct",
      fallback: "network",
      patient: {
        ...paPatient,
        first_name: "Portal",
        last_name: "Five03",
        email: `portal.503a+${stamp}@wellnesstechdistribution.com`,
        external_patient_id: `wt-work-503a-${stamp}`,
        phone: `+1305558${String(stamp).slice(-4)}`,
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
      shipping_address: {
        name: "Portal Five03",
        line1: "100 Market St",
        city: "Philadelphia",
        state: "PA",
        postal_code: "19107",
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

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
