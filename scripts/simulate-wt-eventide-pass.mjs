/**
 * Full simulation: new WT user (already created or create) + WT order → Eventide.
 * Uses known-good patient demographics (Eventide currently 500s on some new patient creates).
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
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
const stamp = Date.now();
const secret = process.env.WT_PARTNER_ORDER_SECRET || "";
const vrKey = process.env.VITARELAY_API_KEY || process.env.EVENTIDE_API_KEY || "";
const vrBase = (
  process.env.VITARELAY_PRACTICE_API_BASE_URL ||
  process.env.EVENTIDE_API_BASE_URL ||
  "https://vitarelay.com/api/public/practice/v1"
).replace(/\/$/, "");

const password = `WtSim#${randomInt(1000, 9999)}!`;
const pin = String(randomInt(100000, 999999));
const email = `sim.provider+${stamp}@wellnesstechdistribution.com`;

const org = await prisma.organization.findFirst({
  where: { OR: [{ slug: "kian-prive-partner" }, { clinicCode: "kianprive" }] },
});
if (!org) throw new Error("kian-prive-partner org missing");

const user = await prisma.user.create({
  data: {
    orgId: org.id,
    email,
    name: `Sim Clinician ${String(stamp).slice(-4)}`,
    roles: JSON.stringify(["owner", "prescriber"]),
    passwordHash: await bcrypt.hash(password, 12),
    mfaHash: await bcrypt.hash(pin, 10),
    mfaEnabled: true,
    lastLoginAt: new Date(),
  },
});

console.log(
  JSON.stringify(
    {
      step: "created_user",
      email,
      password,
      pin,
      userId: user.id,
      loginUrl: "https://www.wellnesstechdistribution.com/login",
    },
    null,
    2,
  ),
);

const externalRef = `WT-SIM-PASS-${stamp}`;
const body = {
  externalRef,
  email: `kian.smoke+${stamp}@kianprive.com`,
  partnerSite: "kian-prive",
  notes: `Simulation by ${email}`,
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
      sig: "As directed — WT→Eventide simulation",
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
const data = await res.json().catch(() => ({}));
console.log(JSON.stringify({ step: "wt_order", httpStatus: res.status, data }, null, 2));

if (!data.eventideOrderId) {
  console.error(JSON.stringify({ ok: false, error: "No Eventide order id", data }));
  process.exit(1);
}

const headers = { Authorization: `Bearer ${vrKey}`, Accept: "application/json" };
if (process.env.EVENTIDE_PLACED_BY_USER_ID) headers["X-User-Id"] = process.env.EVENTIDE_PLACED_BY_USER_ID;
const remote = await fetch(`${vrBase}/orders/${encodeURIComponent(data.eventideOrderId)}`, { headers });
const remoteJson = await remote.json();
const d = remoteJson.data || {};

const wtOrder = await prisma.order.findUnique({
  where: { id: data.orderId },
  select: {
    id: true,
    invoiceNumber: true,
    status: true,
    eventideOrderId: true,
    splitMessage: true,
    partnerExternalRef: true,
  },
});

const awaiting = /awaiting_payment/i.test(String(d.status || "")) || /awaiting_payment/i.test(String(d.payment_status || ""));

console.log(
  JSON.stringify(
    {
      step: "result",
      simulationPassed: Boolean(data.eventideOrderId) && awaiting,
      newUser: { email, password, pin, login: "https://www.wellnesstechdistribution.com/login" },
      wellnessTech: wtOrder,
      eventide: {
        id: data.eventideOrderId,
        order_number: d.order_number,
        status: d.status,
        payment_status: d.payment_status,
        total_cents: d.total_cents,
        note: "No card on file — awaiting_payment is expected until practice billing is added in VitaRelay.",
      },
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
if (!awaiting) process.exit(2);
