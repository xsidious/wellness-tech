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
const key = env.EVENTIDE_API_KEY || env.VITARELAY_API_KEY || "";
const base = (
  env.EVENTIDE_API_BASE_URL ||
  env.VITARELAY_PRACTICE_API_BASE_URL ||
  "https://vitarelay.com/api/public/practice/v1"
).replace(/\/$/, "");
const headers = {
  Authorization: `Bearer ${key}`,
  Accept: "application/json",
};
if (env.EVENTIDE_PLACED_BY_USER_ID) headers["X-User-Id"] = env.EVENTIDE_PLACED_BY_USER_ID;

const paths = [
  "/prescribers",
  "/pharmacies",
  "/prescriber-route?state=FL",
  "/providers",
  "/physicians",
];

for (const path of paths) {
  const r = await fetch(`${base}${path}`, { headers });
  const t = await r.text();
  let j;
  try {
    j = JSON.parse(t);
  } catch {
    j = { raw: t.slice(0, 500) };
  }
  const data = j.data;
  console.log(
    JSON.stringify(
      {
        path,
        status: r.status,
        keys: j && typeof j === "object" ? Object.keys(j) : [],
        count: Array.isArray(data) ? data.length : undefined,
        sample: Array.isArray(data) ? data.slice(0, 3) : data,
        error: j.error || j.message,
      },
      null,
      2,
    ),
  );
}
