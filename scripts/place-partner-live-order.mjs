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
const secret = env.WT_PARTNER_ORDER_SECRET || "";
const stamp = Date.now();
const body = {
  externalRef: `KP-LIVE-SMOKE-${stamp}`,
  email: `kian.smoke+${stamp}@kianprive.com`,
  partnerSite: "kian-prive",
  notes: "Live partner smoke from deploy verification",
  shippingDestinationType: "patient_direct",
  shipTo: {
    name: "Portal Smoke",
    street1: "200 Biscayne Blvd",
    city: "Miami",
    state: "FL",
    zip: "33131",
  },
  patient: {
    firstName: "Portal",
    lastName: "Smoke",
    dateOfBirth: "1988-04-12",
    phone: "+13055550188",
    email: `kian.smoke+${stamp}@kianprive.com`,
    address: {
      line1: "200 Biscayne Blvd",
      city: "Miami",
      state: "FL",
      zipCode: "33131",
      country: "US",
    },
  },
  prescriber: {
    firstName: "Carmen",
    lastName: "Ramirez",
    npiNumber: env.EVENTIDE_PRESCRIBER_NPI || "1023022357",
    licenseState: env.EVENTIDE_PRESCRIBER_LICENSE_STATE || "FL",
    licenseNumber: env.EVENTIDE_PRESCRIBER_LICENSE_NUMBER || "84581",
  },
  lines: [
    {
      sku: "b108dc04-25c2-4c5e-b115-4e008e921c36",
      platformProductId: "b108dc04-25c2-4c5e-b115-4e008e921c36",
      name: "Taurine (PF) 50mg/mL; 30mL (1,500mg)",
      qty: 1,
      sig: "As directed — WT partner live smoke",
    },
  ],
};

const res = await fetch("https://www.wellnesstechdistribution.com/api/partner/orders", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-wt-partner-secret": secret,
    "x-wt-partner-site": "kian-prive",
  },
  body: JSON.stringify(body),
});
const text = await res.text();
let data = {};
try {
  data = JSON.parse(text);
} catch {
  data = { raw: text.slice(0, 1200) };
}
console.log(JSON.stringify({ status: res.status, ok: res.ok, data }, null, 2));

if (res.ok && data.eventideOrderId) {
  const key = env.VITARELAY_API_KEY || env.EVENTIDE_API_KEY || "";
  const base = (env.VITARELAY_PRACTICE_API_BASE_URL || env.EVENTIDE_API_BASE_URL || "").replace(/\/$/, "");
  const remote = await fetch(`${base}/orders/${encodeURIComponent(data.eventideOrderId)}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  const remoteText = await remote.text();
  console.log("remoteStatus", remote.status, remoteText.slice(0, 800));
}

if (!res.ok) process.exit(1);
