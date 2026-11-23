/**
 * Probe Practice API for billing / payment / webhook / roster endpoints.
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
const key = env.VITARELAY_API_KEY || env.EVENTIDE_API_KEY || "";
const base = (
  env.VITARELAY_PRACTICE_API_BASE_URL ||
  env.EVENTIDE_API_BASE_URL ||
  "https://vitarelay.com/api/public/practice/v1"
).replace(/\/$/, "");
const placer = env.EVENTIDE_PLACED_BY_USER_ID || env.VITARELAY_PLACED_BY_USER_ID || "";
const headers = {
  Authorization: `Bearer ${key}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};
if (placer) headers["X-User-Id"] = placer;

async function req(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 600) };
  }
  return { method, path, ok: res.ok, status: res.status, data };
}

const orderId = "3ab825bb-21b1-4217-996c-bd235a6ec270";
const probes = [
  ["GET", `/orders/${orderId}`],
  ["GET", "/prescribers"],
  ["GET", "/webhooks"],
  ["GET", "/billing"],
  ["GET", "/billing/methods"],
  ["GET", "/payment-methods"],
  ["GET", "/account/billing"],
  ["GET", "/practice/billing"],
  ["POST", `/orders/${orderId}/pay`, {}],
  ["POST", `/orders/${orderId}/charge`, {}],
  ["POST", `/orders/${orderId}/retry-payment`, {}],
];

for (const [method, path, body] of probes) {
  const r = await req(method, path, body);
  console.log(
    JSON.stringify(
      {
        method: r.method,
        path: r.path,
        status: r.status,
        ok: r.ok,
        preview: JSON.stringify(r.data).slice(0, 700),
      },
      null,
      2,
    ),
  );
}

// Also try public v1 orders list (read API)
const publicBase = "https://vitarelay.com/api/public/v1";
for (const path of [`/orders/${orderId}`, "/orders?limit=5"]) {
  const res = await fetch(`${publicBase}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  const text = await res.text();
  console.log(
    JSON.stringify(
      {
        api: "public/v1",
        path,
        status: res.status,
        preview: text.slice(0, 500),
      },
      null,
      2,
    ),
  );
}
