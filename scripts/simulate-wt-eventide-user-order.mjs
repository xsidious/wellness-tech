/**
 * Simulation: create a new WT practice user, place an order via production
 * partner API → Eventide/VitaRelay, accept awaiting_payment as success.
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
const patientEmail = `sim.patient+${stamp}@wellnesstechdistribution.com`;

async function main() {
  // 1) Ensure KIAN partner org exists and create a new practice user on it
  let org = await prisma.organization.findFirst({
    where: { OR: [{ slug: "kian-prive-partner" }, { clinicCode: "kianprive" }] },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        type: "practice",
        legalName: "KIAN Privé Simulation",
        slug: `kian-sim-${stamp}`,
        clinicCode: "kiansim",
        verificationTier: 2,
        status: "active",
        onboardingComplete: true,
      },
    });
  }

  const user = await prisma.user.create({
    data: {
      orgId: org.id,
      email,
      name: `Sim Provider ${stamp.toString().slice(-4)}`,
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
        userId: user.id,
        email,
        password,
        pin,
        orgId: org.id,
        orgSlug: org.slug,
        loginUrl: "https://www.wellnesstechdistribution.com/login",
      },
      null,
      2,
    ),
  );

  // 2) Place order through production Wellness Tech → Eventide
  const externalRef = `WT-SIM-${stamp}`;
  const body = {
    externalRef,
    email: patientEmail,
    partnerSite: "kian-prive",
    notes: `Simulation order by new user ${email}`,
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
      lastName: `Patient${stamp.toString().slice(-4)}`,
      dateOfBirth: "1991-06-18",
      phone: "+13055550177",
      email: patientEmail,
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
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 1500) };
  }

  console.log(
    JSON.stringify(
      {
        step: "wt_partner_order",
        httpStatus: res.status,
        ok: res.ok,
        data,
      },
      null,
      2,
    ),
  );

  if (!res.ok || !data.eventideOrderId) {
    throw new Error(`WT order failed: ${JSON.stringify(data)}`);
  }

  // 3) Confirm on Eventide/VitaRelay (awaiting_payment is expected/success for this sim)
  const headers = { Authorization: `Bearer ${vrKey}`, Accept: "application/json" };
  if (process.env.EVENTIDE_PLACED_BY_USER_ID) headers["X-User-Id"] = process.env.EVENTIDE_PLACED_BY_USER_ID;

  const remote = await fetch(`${vrBase}/orders/${encodeURIComponent(data.eventideOrderId)}`, {
    headers,
    cache: "no-store",
  });
  const remoteJson = await remote.json().catch(() => ({}));
  const d = remoteJson.data || remoteJson;

  const publicRemote = await fetch(
    `https://vitarelay.com/api/public/v1/orders/${encodeURIComponent(data.eventideOrderId)}`,
    { headers, cache: "no-store" },
  );
  const publicJson = await publicRemote.json().catch(() => ({}));
  const p = publicJson.data || {};

  const status = String(d.status || p.status || "");
  const payment = String(d.payment_status || p.payment_status || "");
  const expectedAwaiting = /awaiting_payment/i.test(status) || /awaiting_payment/i.test(payment);

  console.log(
    JSON.stringify(
      {
        step: "eventide_remote",
        httpStatus: remote.status,
        orderId: data.eventideOrderId,
        orderNumber: d.order_number || p.order_number || null,
        status,
        payment_status: payment,
        environment: p.environment || null,
        total_cents: d.total_cents || p.total_cents || null,
        awaitingPaymentExpected: true,
        awaitingPaymentObserved: expectedAwaiting,
        simulationPassed: remote.ok && Boolean(data.eventideOrderId) && expectedAwaiting,
      },
      null,
      2,
    ),
  );

  // 4) Link summary for WT DB order
  const wtOrder = await prisma.order.findUnique({
    where: { id: data.orderId },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      eventideOrderId: true,
      splitMessage: true,
      source: true,
      partnerExternalRef: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        step: "summary",
        newUser: { email, password, pin, loginUrl: "https://www.wellnesstechdistribution.com/login" },
        wtOrder,
        eventide: {
          id: data.eventideOrderId,
          number: d.order_number || p.order_number,
          status,
          payment_status: payment,
        },
        verdict: expectedAwaiting
          ? "PASS — WT created order and Eventide accepted it (awaiting_payment as expected)."
          : "PARTIAL — order created but Eventide status was not awaiting_payment.",
      },
      null,
      2,
    ),
  );

  if (!expectedAwaiting) process.exit(2);
}

main()
  .catch((err) => {
    console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
