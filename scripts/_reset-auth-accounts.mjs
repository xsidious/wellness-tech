/**
 * Reset working admin / practice / affiliate logins for Carmen + demos.
 * Run: node scripts/_reset-auth-accounts.mjs
 */
import fs from "fs";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const raw = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
for (const line of raw.split(/\r?\n/)) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  const k = line.slice(0, i);
  const v = line.slice(i + 1).replace(/^["']|["']$/g, "");
  if (!process.env[k]) process.env[k] = v;
}

const ADMIN_PASSWORD = "WellnessTech#Admin9!";
const PRACTICE_PASSWORD = "PracticeLogin#9!";
const AFFILIATE_PASSWORD = "AffiliateLogin#9!";
const PIN = "246810";

const p = new PrismaClient();
const passwordHashAdmin = await bcrypt.hash(ADMIN_PASSWORD, 12);
const passwordHashPractice = await bcrypt.hash(PRACTICE_PASSWORD, 12);
const passwordHashAffiliate = await bcrypt.hash(AFFILIATE_PASSWORD, 12);
const mfaHash = await bcrypt.hash(PIN, 10);

async function ensureOrg({ type, legalName, slug, verificationTier = 0 }) {
  const existing = await p.organization.findFirst({ where: { slug } });
  if (existing) {
    if (existing.verificationTier !== verificationTier && verificationTier > existing.verificationTier) {
      return p.organization.update({
        where: { id: existing.id },
        data: { verificationTier },
      });
    }
    return existing;
  }
  return p.organization.create({
    data: { type, legalName, slug, verificationTier, assignedRep: "Alex Morgan" },
  });
}

async function setUser({ email, name, roles, orgId, passwordHash, withMfa = true }) {
  const existing = await p.user.findUnique({ where: { email } });
  const payload = {
    name,
    roles: JSON.stringify(roles),
    passwordHash,
    mfaHash: withMfa ? mfaHash : "",
    mfaEnabled: withMfa,
  };
  if (existing) {
    return p.user.update({
      where: { email },
      data: { ...payload, orgId },
    });
  }
  return p.user.create({
    data: {
      email,
      ...payload,
      org: { connect: { id: orgId } },
    },
  });
}

const adminOrg = await ensureOrg({
  type: "operator",
  legalName: "Wellness Tech",
  slug: "wellness-tech",
});
const fairfax = await ensureOrg({
  type: "practice",
  legalName: "Fairfax Concierge",
  slug: "fairfax",
  verificationTier: 2,
});
const affiliateOrg = await ensureOrg({
  type: "affiliate",
  legalName: "North Affiliates",
  slug: "north-affiliates",
});

const adminA = await setUser({
  email: "admin@thewellnesstech.com",
  name: "Carmen / Wellness Tech Admin",
  roles: ["admin"],
  orgId: adminOrg.id,
  passwordHash: passwordHashAdmin,
  withMfa: false,
});
const adminB = await setUser({
  email: "admin@wellnesstech.demo",
  name: "Wellness Tech Admin",
  roles: ["admin"],
  orgId: adminOrg.id,
  passwordHash: passwordHashAdmin,
  withMfa: false,
});

const owner = await setUser({
  email: "owner@fairfax.demo",
  name: "Dana Ellis",
  roles: ["owner", "prescriber"],
  orgId: fairfax.id,
  passwordHash: passwordHashPractice,
  withMfa: true,
});

const existingCred = await p.prescriberCredential.findUnique({ where: { userId: owner.id } });
if (existingCred) {
  await p.prescriberCredential.update({
    where: { userId: owner.id },
    data: {
      npi: "1000000001",
      displayName: "Dana Ellis, MD",
      specialty: "Concierge medicine",
      verificationTier: 2,
    },
  });
} else {
  await p.prescriberCredential.create({
    data: {
      userId: owner.id,
      npi: "1000000001",
      displayName: "Dana Ellis, MD",
      specialty: "Concierge medicine",
      licenseCipher: "",
      oigStatus: "pending_vendor",
      verificationTier: 2,
    },
  });
}

const affiliate = await setUser({
  email: "affiliate@sales.demo",
  name: "Riley Chen",
  roles: ["affiliate"],
  orgId: affiliateOrg.id,
  passwordHash: passwordHashAffiliate,
  withMfa: true,
});

const existingAff = await p.affiliateProfile.findUnique({ where: { userId: affiliate.id } });
if (!existingAff) {
  await p.affiliateProfile.create({
    data: {
      userId: affiliate.id,
      code: "FAIRFAX",
      payoutToken: "tok_bank_sandbox",
      w9Status: "sandbox_received",
      partnerLink: "https://www.wellnesstechdistribution.com/signup?ref=FAIRFAX",
    },
  });
}

const vivian = await p.user.findUnique({ where: { email: "vjesu001@yahoo.com" } });
let vivianFixed = false;
if (vivian && !vivian.passwordHash) {
  await p.user.update({
    where: { id: vivian.id },
    data: {
      passwordHash: passwordHashAffiliate,
      mfaHash,
      mfaEnabled: true,
    },
  });
  vivianFixed = true;
}

// Clear recent lockouts for these emails so Carmen can sign in immediately
await p.auditEvent.deleteMany({
  where: {
    action: "auth.login_failed",
    object: {
      in: [
        "admin@thewellnesstech.com",
        "admin@wellnesstech.demo",
        "owner@fairfax.demo",
        "affiliate@sales.demo",
        "vjesu001@yahoo.com",
      ],
    },
  },
});

console.log(
  JSON.stringify(
    {
      ok: true,
      admin: {
        emails: [adminA.email, adminB.email],
        password: ADMIN_PASSWORD,
        url: "https://www.wellnesstechdistribution.com/admin/login",
      },
      practitioner: {
        email: owner.email,
        password: PRACTICE_PASSWORD,
        pin: PIN,
        url: "https://www.wellnesstechdistribution.com/login",
      },
      affiliate: {
        email: affiliate.email,
        password: AFFILIATE_PASSWORD,
        pin: PIN,
        url: "https://www.wellnesstechdistribution.com/login",
        signupUrl: "https://www.wellnesstechdistribution.com/signup?type=affiliate",
      },
      vivianFixed,
    },
    null,
    2,
  ),
);

await p.$disconnect();
