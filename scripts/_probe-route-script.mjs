import { readFileSync } from "fs";
import { resolve } from "path";

const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
const env = {};
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

const key = env.EVENTIDE_API_KEY || env.VITARELAY_API_KEY || "";
const base = (
  env.EVENTIDE_API_BASE_URL ||
  env.VITARELAY_PRACTICE_API_BASE_URL ||
  "https://vitarelay.com/api/public/practice/v1"
).replace(/\/$/, "");
const headers = {
  Authorization: `Bearer ${key}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};
if (env.EVENTIDE_PLACED_BY_USER_ID) headers["X-User-Id"] = env.EVENTIDE_PLACED_BY_USER_ID;

for (const state of ["FL", "TX", "CA", "NY", "GA"]) {
  const r = await fetch(`${base}/prescriber-route?state=${state}`, { headers });
  const j = await r.json();
  console.log(state, r.status, JSON.stringify(j.data || j));
}

const sr = await fetch(`${base}/script-requests`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    patient: {
      first_name: "Test",
      last_name: "Patient",
      dob: "1990-01-01",
      address: { line1: "1 Main", city: "Miami", state: "FL", postal_code: "33101" },
      external_patient_id: `probe-script-${Date.now()}`,
    },
    provider: { external_id: "kian-prive", name: "KIAN Prive", kind: "tele_clinic" },
    medications: [{ platform_product_id: "00000000-0000-0000-0000-000000000001" }],
    note: "probe only",
  }),
});
const st = await sr.text();
console.log("script-requests", sr.status, st.slice(0, 800));
