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

const queries = ["FOXO4", "FOXO", "foxo4"];
const results = {};
for (const q of queries) {
  const res = await fetch(`${base}/catalog?limit=50&q=${encodeURIComponent(q)}`, { headers });
  const body = await res.json();
  const rows = Array.isArray(body?.data) ? body.data : [];
  results[q] = {
    status: res.status,
    count: rows.length,
    sample: rows.slice(0, 8).map((r) => ({
      id: r.id,
      name: r.name,
      sku: r.sku,
      slug: r.slug,
      strength: r.strength,
      size: r.size,
      category: r.category,
    })),
  };
}

// Also page through catalog looking for foxo
let foxoHits = [];
for (let page = 1; page <= 20; page++) {
  const res = await fetch(`${base}/catalog?limit=100&page=${page}`, { headers });
  const body = await res.json();
  const rows = Array.isArray(body?.data) ? body.data : [];
  if (!rows.length) break;
  for (const r of rows) {
    const blob = `${r.name || ""} ${r.sku || ""} ${r.slug || ""}`.toLowerCase();
    if (blob.includes("foxo")) {
      foxoHits.push({
        id: r.id,
        name: r.name,
        sku: r.sku,
        slug: r.slug,
        strength: r.strength,
        size: r.size,
      });
    }
  }
  if (rows.length < 100) break;
}

console.log(JSON.stringify({ keyKind: key.slice(0, 8), results, foxoHits }, null, 2));
