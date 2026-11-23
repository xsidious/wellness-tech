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

const orderId = "3ab825bb-21b1-4217-996c-bd235a6ec270";
const [roster, order, publicOrder] = await Promise.all([
  fetch(`${base}/prescribers`, { headers }).then(async (r) => ({ status: r.status, body: await r.json() })),
  fetch(`${base}/orders/${orderId}`, { headers }).then(async (r) => ({ status: r.status, body: await r.json() })),
  fetch(`https://vitarelay.com/api/public/v1/orders/${orderId}`, { headers }).then(async (r) => ({
    status: r.status,
    body: await r.json(),
  })),
]);

const blockers = [];
if (!key.startsWith("vr_live_")) blockers.push("API key is not vr_live_");
if (!env.EVENTIDE_PLACED_BY_USER_ID) blockers.push("Missing EVENTIDE_PLACED_BY_USER_ID");
if (!env.EVENTIDE_PRESCRIBER_NPI) blockers.push("Missing EVENTIDE_PRESCRIBER_NPI");
if (!env.EVENTIDE_WEBHOOK_SECRET && !env.VITARELAY_WEBHOOK_SECRET) blockers.push("Missing webhook secret");
const pay = publicOrder.body?.data?.payment_status || order.body?.data?.payment_status;
const remoteEnv = publicOrder.body?.data?.environment;
if (String(pay).toLowerCase() === "awaiting_payment") {
  blockers.push("Order awaiting_payment — practice billing not clearing");
}
if (String(remoteEnv).toLowerCase() === "sandbox") {
  blockers.push("Order environment=sandbox — live Eventide desk may hide it until billing is activated");
}

console.log(
  JSON.stringify(
    {
      keyKind: key.startsWith("vr_live_") ? "live" : key.startsWith("vr_test_") ? "test" : "other",
      base,
      kianCallback: env.KIAN_STATUS_WEBHOOK_URL,
      webhookTarget: env.EVENTIDE_WEBHOOK_URL,
      rosterCount: Array.isArray(roster.body?.data) ? roster.body.data.length : 0,
      rosterSample: roster.body?.data?.[0] || null,
      order: {
        number: order.body?.data?.order_number || publicOrder.body?.data?.order_number,
        status: order.body?.data?.status,
        payment: pay,
        environment: remoteEnv,
      },
      blockers,
      nextSteps: [
        "Login https://vitarelay.com/login with the Eventide/Wellness Tech practice account",
        "Add practice card on file (or ask Eventide for invoice billing)",
        "Confirm webhook → https://www.wellnesstechdistribution.com/api/webhooks/eventide",
        "Retry/place a new order from Wellness Tech, then search VR-… under practice Orders",
      ],
    },
    null,
    2,
  ),
);
