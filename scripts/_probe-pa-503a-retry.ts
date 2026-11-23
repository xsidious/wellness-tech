import { readFileSync } from "fs";
import { resolve } from "path";
import { randomInt } from "crypto";

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
  const rxId = "6c150fd6-1f29-45be-aca4-c81a796a864f";
  const phone = `+1305${randomInt(2000000, 8999999)}`;

  for (const state of ["PA", "TX", "NY", "CA"]) {
    const r = await call("POST", "/prescriptions", {
      external_order_id: `WT-MULTI-${state}-${stamp}`,
      shipping_destination_type: "patient_direct",
      patient: {
        first_name: "Portal",
        last_name: state,
        dob: "1988-04-12",
        email: `portal.${state.toLowerCase()}+${stamp}@wellnesstechdistribution.com`,
        phone: state === "PA" ? phone : `+1305${randomInt(2000000, 8999999)}`,
        external_patient_id: `wt-multi-${state.toLowerCase()}-${stamp}`,
        address: {
          line1: "100 Main St",
          city: state === "PA" ? "Philadelphia" : state === "TX" ? "Austin" : state === "NY" ? "New York" : "Los Angeles",
          state,
          postal_code: state === "PA" ? "19107" : state === "TX" ? "78701" : state === "NY" ? "10001" : "90001",
        },
      },
      prescriptions: [
        {
          platform_product_id: rxId,
          drug_name: "5-Amino 50mg; Each",
          sig: "As directed by Eventide prescribing clinician.",
          order_quantity: 1,
          quantity: 1,
        },
      ],
      shipping_address: {
        name: `Portal ${state}`,
        line1: "100 Main St",
        city: state === "PA" ? "Philadelphia" : state === "TX" ? "Austin" : state === "NY" ? "New York" : "Los Angeles",
        state,
        postal_code: state === "PA" ? "19107" : state === "TX" ? "78701" : state === "NY" ? "10001" : "90001",
        country: "US",
      },
      prescriber: {
        full_name: "Carmen Ramirez",
        npi_number: npi,
        licenses: [
          { state: "FL", number: flLic },
          { state, number: flLic },
        ],
      },
    });
    console.log(
      state,
      r.ok,
      r.status,
      (r.data as { error?: { message?: string } })?.error?.message ||
        (r.data as { data?: { order_id?: string; order_number?: string } })?.data?.order_id,
      (r.data as { data?: { order_number?: string } })?.data?.order_number,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
