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
const key = env.VITARELAY_API_KEY || env.EVENTIDE_API_KEY || "";
const base = (
  env.VITARELAY_PRACTICE_API_BASE_URL ||
  env.EVENTIDE_API_BASE_URL ||
  "https://vitarelay.com/api/public/practice/v1"
).replace(/\/$/, "");
const placer = env.EVENTIDE_PLACED_BY_USER_ID || "";

const headers = {
  Authorization: `Bearer ${key}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};
if (placer) headers["X-User-Id"] = placer;

const catalog = await fetch(`${base}/catalog?limit=1`, { headers }).then(async (r) => ({
  status: r.status,
  data: await r.json().catch(() => ({})),
}));
const roster = await fetch(`${base}/prescribers`, { headers }).then(async (r) => ({
  status: r.status,
  data: await r.json().catch(() => ({})),
}));
const productId = catalog.data?.data?.[0]?.id;
const one = productId
  ? await fetch(`${base}/catalog/${productId}`, { headers }).then(async (r) => ({
      status: r.status,
      data: await r.json().catch(() => ({})),
    }))
  : null;

console.log(
  JSON.stringify(
    {
      keyPrefix: key.slice(0, 10),
      catalog: { status: catalog.status, count: catalog.data?.data?.length },
      roster: {
        status: roster.status,
        count: Array.isArray(roster.data?.data) ? roster.data.data.length : null,
        sample: Array.isArray(roster.data?.data)
          ? roster.data.data.slice(0, 2).map((p) => ({
              npi: p.npi_number,
              name: p.full_name,
              has_dea: p.has_dea,
            }))
          : roster.data,
      },
      product: one ? { status: one.status, name: one.data?.data?.name || one.data?.name } : null,
    },
    null,
    2,
  ),
);
