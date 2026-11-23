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

async function main() {
  const stamp = Date.now();
  const npi = (process.env.EVENTIDE_PRESCRIBER_NPI || "1023022357").replace(/\D/g, "");
  const flLic = process.env.EVENTIDE_PRESCRIBER_LICENSE_NUMBER || "84581";
  const productId = "119df359-ebf4-4c6a-8084-64cdadac5853";
  const rxId = "6c150fd6-1f29-45be-aca4-c81a796a864f"; // 5-Amino 50mg 503a

  console.log("roster", JSON.stringify(await call("GET", "/prescribers"), null, 2).slice(0, 800));
  console.log("route PA", JSON.stringify(await call("GET", "/prescriber-route?state=PA"), null, 2).slice(0, 500));
  console.log("route FL", JSON.stringify(await call("GET", "/prescriber-route?state=FL"), null, 2).slice(0, 500));

  // Restore FL license first (we may have overwritten to PA only)
  console.log(
    "restore FL",
    JSON.stringify(
      await call("POST", "/prescribers", {
        full_name: "Carmen Ramirez",
        npi_number: npi,
        license_state: "FL",
        license_number: flLic,
        role: "prescriber",
      }),
      null,
      2,
    ).slice(0, 500),
  );

  // Try adding licenses array if supported
  console.log(
    "multi licenses array",
    JSON.stringify(
      await call("POST", "/prescribers", {
        full_name: "Carmen Ramirez",
        npi_number: npi,
        licenses: [
          { state: "FL", number: flLic },
          { state: "PA", number: flLic },
        ],
        role: "prescriber",
      }),
      null,
      2,
    ).slice(0, 700),
  );

  console.log("roster after", JSON.stringify(await call("GET", "/prescribers"), null, 2).slice(0, 900));

  // Place PA order with Carmen claiming PA license in the request body (not roster overwrite)
  const pa = await call("POST", "/prescriptions", {
    external_order_id: `WT-PA-BODYLIC-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: {
      first_name: "Portal",
      last_name: "BodyLic",
      dob: "1988-04-12",
      email: `portal.bodylic+${stamp}@wellnesstechdistribution.com`,
      phone: `+1305560${String(stamp).slice(-4)}`,
      external_patient_id: `wt-bodylic-${stamp}`,
      address: {
        line1: "100 Market St",
        city: "Philadelphia",
        state: "PA",
        postal_code: "19107",
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
      name: "Portal BodyLic",
      line1: "100 Market St",
      city: "Philadelphia",
      state: "PA",
      postal_code: "19107",
      country: "US",
    },
    prescriber: {
      full_name: "Carmen Ramirez",
      npi_number: npi,
      licenses: [
        { state: "FL", number: flLic },
        { state: "PA", number: flLic },
      ],
    },
  });
  console.log("PA body multi licenses", JSON.stringify(pa, null, 2).slice(0, 900));

  // 503A PA with multi licenses in body
  const pa503 = await call("POST", "/prescriptions", {
    external_order_id: `WT-PA-503A-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: {
      first_name: "Portal",
      last_name: "Amino",
      dob: "1988-04-12",
      email: `portal.amino+${stamp}@wellnesstechdistribution.com`,
      phone: `+1305561${String(stamp).slice(-4)}`,
      external_patient_id: `wt-amino-${stamp}`,
      address: {
        line1: "100 Market St",
        city: "Philadelphia",
        state: "PA",
        postal_code: "19107",
      },
    },
    prescriptions: [
      {
        platform_product_id: rxId,
        drug_name: "5-Amino 50mg; Each",
        sig: "As directed",
        order_quantity: 1,
        quantity: 1,
      },
    ],
    shipping_address: {
      name: "Portal Amino",
      line1: "100 Market St",
      city: "Philadelphia",
      state: "PA",
      postal_code: "19107",
      country: "US",
    },
    prescriber: {
      full_name: "Carmen Ramirez",
      npi_number: npi,
      licenses: [
        { state: "FL", number: flLic },
        { state: "PA", number: flLic },
      ],
    },
  });
  console.log("PA 503A multi licenses", JSON.stringify(pa503, null, 2).slice(0, 900));

  // Two-step RND for brand new PA patient: chart under FL first? Better: create via FL prescriptions then orders PA
  // Or: chart with FL address matching Carmen, then /orders to PA — already proven.
  // Better flow for RND: use /prescriptions with Carmen FL but patient address FL for charting? No - patient lives in PA.
  // Correct RND flow: 
  // 1) Create patient somehow
  // For brand-new PA RND patient without MD in PA:
  // Use /prescriptions with Carmen + licenses including patient state in body (if API accepts)

  // Ensure FL still works after roster changes
  const fl = await call("POST", "/prescriptions", {
    external_order_id: `WT-FL-CHECK-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: {
      first_name: "Portal",
      last_name: "FlCheck",
      dob: "1988-04-12",
      email: `portal.flcheck+${stamp}@wellnesstechdistribution.com`,
      phone: `+1305562${String(stamp).slice(-4)}`,
      external_patient_id: `wt-flcheck-${stamp}`,
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
      name: "Portal FlCheck",
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
  });
  console.log("FL still works", JSON.stringify(fl, null, 2).slice(0, 700));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
