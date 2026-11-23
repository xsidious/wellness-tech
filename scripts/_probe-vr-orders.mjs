/**
 * Probe VitaRelay Practice API: who am I, list recent orders, fetch known smoke ids.
 * Prints no secrets.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

const env = loadEnv();
const key = env.VITARELAY_API_KEY || env.EVENTIDE_API_KEY || env.EVENTIDE_API_TOKEN || "";
const base = (
  env.VITARELAY_PRACTICE_API_BASE_URL ||
  env.EVENTIDE_API_BASE_URL ||
  "https://vitarelay.com/api/public/practice/v1"
).replace(/\/$/, "");
const placer = env.EVENTIDE_PLACED_BY_USER_ID || env.VITARELAY_PLACED_BY_USER_ID || "";

const headers = {
  Authorization: `Bearer ${key}`,
  Accept: "application/json",
};
if (placer) headers["X-User-Id"] = placer;

async function get(path) {
  const res = await fetch(`${base}${path}`, { headers, cache: "no-store" });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 800) };
  }
  return { ok: res.ok, status: res.status, data };
}

console.log(
  JSON.stringify(
    {
      base,
      keyKind: key.startsWith("vr_live_") ? "live" : key.startsWith("vr_test_") ? "test" : "other",
      keyPrefix: key.slice(0, 12),
      hasPlacer: Boolean(placer),
      placerPrefix: placer ? placer.slice(0, 8) : null,
    },
    null,
    2,
  ),
);

const probes = [
  "/me",
  "/account",
  "/practice",
  "/orders?limit=10&page=1",
  "/orders?limit=10",
  "/prescriptions?limit=10",
  "/orders/3ab825bb-21b1-4217-996c-bd235a6ec270",
  "/orders/VR-20261116-3ab825",
];

for (const path of probes) {
  const r = await get(path);
  const summary = {
    path,
    ok: r.ok,
    status: r.status,
    keys: r.data && typeof r.data === "object" ? Object.keys(r.data) : [],
    dataPreview: JSON.stringify(r.data).slice(0, 900),
  };
  console.log(JSON.stringify(summary, null, 2));
}
