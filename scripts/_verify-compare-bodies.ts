import { randomInt } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";
import { resolveEventideIssuePlan } from "../src/lib/eventide";

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

async function post(body: unknown) {
  const res = await fetch(`${practice}/prescriptions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  const stamp = Date.now();
  const phone = `+1305${randomInt(2000000, 8999999)}`;
  const plan = await resolveEventideIssuePlan({ state: "FL" });
  if (!plan.ok || !plan.prescriber) throw new Error("no md");
  const npi = plan.prescriber.npiNumber!;
  const flLic = plan.prescriber.licenseNumber || process.env.EVENTIDE_PRESCRIBER_LICENSE_NUMBER || "84581";
  const email = `portal.compare+${stamp}@wellnesstechdistribution.com`;

  // Exact shape the library now builds
  const libLike = {
    external_order_id: `WT-COMPARE-LIB-${stamp}`,
    shipping_destination_type: "patient_direct",
    patient: {
      first_name: "Portal",
      last_name: "Smoke",
      dob: "1988-04-12",
      email,
      phone,
      external_patient_id: email.replace(/[^a-z0-9@._+-]+/gi, "-").slice(0, 128),
      address: {
        line1: "100 Market St",
        city: "Philadelphia",
        state: "PA",
        postal_code: "19107",
      },
    },
    prescriptions: [
      {
        platform_product_id: "119df359-ebf4-4c6a-8084-64cdadac5853",
        drug_name: "AHK-Cu 20mg",
        sig: "As directed",
        order_quantity: 1,
        quantity: 1,
      },
    ],
    shipping_address: {
      name: "Portal Smoke",
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
  };

  console.log("lib-like", JSON.stringify(await post(libLike), null, 2).slice(0, 800));

  const phone2 = `+1305${randomInt(2000000, 8999999)}`;
  const rawLike = {
    ...libLike,
    external_order_id: `WT-COMPARE-RAW-${stamp}`,
    patient: {
      ...libLike.patient,
      email: `portal.compare2+${stamp}@wellnesstechdistribution.com`,
      phone: phone2,
      external_patient_id: `wt-compare-raw-${stamp}`,
    },
  };
  console.log("raw-like", JSON.stringify(await post(rawLike), null, 2).slice(0, 800));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
