import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const pin = await bcrypt.hash("246810", 8);
const adminPassword = await bcrypt.hash("WellnessTech#Admin9!", 12);
const practicePassword = await bcrypt.hash("Practice#Login9!", 12);

async function ensureOrg(slug, data) {
  return prisma.organization.upsert({
    where: { slug },
    update: {},
    create: { slug, ...data },
  });
}

async function ensureUser(email, data) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        mfaHash: pin,
        mfaEnabled: true,
        name: data.name,
        roles: data.roles,
        passwordHash: data.passwordHash || existing.passwordHash,
      },
    });
    return existing;
  }
  return prisma.user.create({
    data: { email, mfaHash: pin, mfaEnabled: true, ...data },
  });
}

const fairfax = await ensureOrg("fairfax", {
  type: "practice",
  legalName: "Fairfax Concierge",
  verificationTier: 2,
  assignedRep: "Alex Morgan",
});
const adminOrg = await ensureOrg("wellness-tech", {
  type: "operator",
  legalName: "Wellness Tech",
  verificationTier: 0,
});
const salesOrg = await ensureOrg("sales-demo", {
  type: "affiliate",
  legalName: "Sales Demo Affiliate",
  verificationTier: 0,
  assignedRep: "Alex Morgan",
});

await ensureUser("owner@fairfax.demo", {
  orgId: fairfax.id,
  name: "Dana Ellis",
  roles: JSON.stringify(["owner", "prescriber"]),
  passwordHash: practicePassword,
});
await ensureUser("billing@fairfax.demo", {
  orgId: fairfax.id,
  name: "Jordan Lee",
  roles: JSON.stringify(["billing"]),
  passwordHash: practicePassword,
});
await ensureUser("affiliate@sales.demo", {
  orgId: salesOrg.id,
  name: "Riley Chen",
  roles: JSON.stringify(["affiliate"]),
  passwordHash: practicePassword,
});
await ensureUser("admin@wellnesstech.demo", {
  orgId: adminOrg.id,
  name: "Wellness Tech Admin",
  roles: JSON.stringify(["admin"]),
  passwordHash: adminPassword,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      logins: [
        {
          email: "admin@wellnesstech.demo",
          password: "WellnessTech#Admin9!",
          portal: "/admin/login",
        },
        {
          email: "owner@fairfax.demo",
          password: "Practice#Login9!",
          pin: "246810",
          portal: "/login",
          note: "Password then 6-digit PIN (MFA)",
        },
        { email: "billing@fairfax.demo", password: "Practice#Login9!", pin: "246810", portal: "/login" },
        { email: "affiliate@sales.demo", password: "Practice#Login9!", pin: "246810", portal: "/login" },
      ],
    },
    null,
    2,
  ),
);
await prisma.$disconnect();
