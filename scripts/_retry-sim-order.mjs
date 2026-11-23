import { readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}
loadEnv();
const prisma = new PrismaClient();

const order = await prisma.order.findUnique({
  where: { id: "cmwjwcwjl0003l908wmw3s0wp" },
  include: { lines: true, clinicalPatient: true },
});
console.log(
  JSON.stringify(
    {
      invoice: order?.invoiceNumber,
      status: order?.status,
      placementError: order?.placementError,
      splitMessage: order?.splitMessage,
      eventideOrderId: order?.eventideOrderId,
      patient: order?.clinicalPatient
        ? {
            email: order.clinicalPatient.email,
            name: order.clinicalPatient.fullName,
            dob: order.clinicalPatient.dateOfBirth,
          }
        : null,
      lines: order?.lines?.map((l) => ({ sku: l.sku, name: l.name })),
    },
    null,
    2,
  ),
);

const stamp = Date.now();
const secret = process.env.WT_PARTNER_ORDER_SECRET || "";
const key = process.env.VITARELAY_API_KEY || process.env.EVENTIDE_API_KEY || "";
const base = (
  process.env.VITARELAY_PRACTICE_API_BASE_URL ||
  process.env.EVENTIDE_API_BASE_URL ||
  "https://vitarelay.com/api/public/practice/v1"
).replace(/\/$/, "");
const headers = {
  Authorization: `Bearer ${key}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};
if (process.env.EVENTIDE_PLACED_BY_USER_ID) headers["X-User-Id"] = process.env.EVENTIDE_PLACED_BY_USER_ID;

// Direct Eventide probe with same shape WT sends
const body = {
  external_order_id: `WT-SIM-DIRECT-${stamp}`,
  shipping_destination_type: "patient_direct",
  patient: {
    first_name: "Sim",
    last_name: "Direct",
    dob: "1991-06-18",
    email: `sim.direct+${stamp}@kianprive.com`,
    phone: "+13055550177",
    external_patient_id: `sim-direct-${stamp}`,
    address: {
      line1: "200 Biscayne Blvd",
      city: "Miami",
      state: "FL",
      postal_code: "33131",
    },
  },
  prescriptions: [
    {
      platform_product_id: "b108dc04-25c2-4c5e-b115-4e008e921c36",
      drug_name: "Taurine (PF) 50mg/mL; 30mL (1,500mg)",
      sig: "As directed — direct sim",
      order_quantity: 1,
      quantity: 1,
    },
  ],
  shipping_address: {
    name: "Sim Direct",
    line1: "200 Biscayne Blvd",
    city: "Miami",
    state: "FL",
    postal_code: "33131",
    country: "US",
  },
  prescriber: {
    full_name: process.env.EVENTIDE_PRESCRIBER_NAME || "Carmen Ramirez",
    npi_number: (process.env.EVENTIDE_PRESCRIBER_NPI || "1023022357").replace(/\D/g, ""),
    licenses: [
      {
        state: process.env.EVENTIDE_PRESCRIBER_LICENSE_STATE || "FL",
        number: process.env.EVENTIDE_PRESCRIBER_LICENSE_NUMBER || "84581",
      },
    ],
  },
};

const placed = await fetch(`${base}/prescriptions`, {
  method: "POST",
  headers,
  body: JSON.stringify(body),
});
const placedText = await placed.text();
console.log("DIRECT_PLACE", placed.status, placedText.slice(0, 1500));

// Retry the on_hold WT order via partner API with new externalRef + kianprive email
const retryBody = {
  externalRef: `WT-SIM-RETRY-${stamp}`,
  email: `sim.patient+${stamp}@kianprive.com`,
  partnerSite: "kian-prive",
  notes: "Retry simulation after patient create error",
  shippingDestinationType: "patient_direct",
  shipTo: {
    name: "Sim Patient",
    street1: "200 Biscayne Blvd",
    city: "Miami",
    state: "FL",
    zip: "33131",
  },
  patient: {
    firstName: "Sim",
    lastName: "Retry",
    dateOfBirth: "1991-06-18",
    phone: "3055550177",
    email: `sim.patient+${stamp}@kianprive.com`,
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
    npiNumber: process.env.EVENTIDE_PRESCRIBER_NPI || "1023022357",
    licenseState: process.env.EVENTIDE_PRESCRIBER_LICENSE_STATE || "FL",
    licenseNumber: process.env.EVENTIDE_PRESCRIBER_LICENSE_NUMBER || "84581",
  },
  lines: [
    {
      sku: "b108dc04-25c2-4c5e-b115-4e008e921c36",
      platformProductId: "b108dc04-25c2-4c5e-b115-4e008e921c36",
      name: "Taurine (PF) 50mg/mL; 30mL (1,500mg)",
      qty: 1,
      sig: "As directed — WT→Eventide retry sim",
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
  body: JSON.stringify(retryBody),
});
const retryText = await res.text();
console.log("WT_RETRY", res.status, retryText.slice(0, 1200));

let retryData = {};
try {
  retryData = JSON.parse(retryText);
} catch {
  retryData = {};
}

if (retryData.eventideOrderId) {
  const remote = await fetch(`${base}/orders/${encodeURIComponent(retryData.eventideOrderId)}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  console.log("REMOTE", remote.status, (await remote.text()).slice(0, 900));
}

await prisma.$disconnect();
