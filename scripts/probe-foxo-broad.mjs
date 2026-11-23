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

let total = 0;
const matches = [];
const sampleNames = [];
for (let page = 1; page <= 50; page++) {
  const r = await fetch(`${base}/catalog?limit=100&page=${page}`, { headers });
  const b = await r.json();
  const rows = Array.isArray(b.data) ? b.data : [];
  if (!rows.length) break;
  total += rows.length;
  for (const row of rows) {
    const n = String(row.name || "");
    if (sampleNames.length < 15) sampleNames.push(n);
    if (/fox|senol|dri|anti.?ag/i.test(n)) {
      matches.push({ id: row.id, name: n, sku: row.sku, slug: row.slug });
    }
  }
  if (rows.length < 100) break;
}

console.log(JSON.stringify({ total, matches, sampleNames }, null, 2));
