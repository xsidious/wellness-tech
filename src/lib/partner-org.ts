import { randomInt, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export type PartnerClinicSite =
  | "kian-prive"
  | "facial-design"
  | "4everglow"
  | "threefold-strength"
  | "hope-and-haven";

type ClinicOrgSeed = {
  site: PartnerClinicSite;
  slug: string;
  legalName: string;
  email: string;
  displayName: string;
  clinicCode: string;
  branding: {
    active: boolean;
    displayName: string;
    tagline: string;
    primary: string;
    secondary: string;
    accent: string;
  };
};

const CLINIC_ORGS: ClinicOrgSeed[] = [
  {
    site: "kian-prive",
    slug: "kian-prive-partner",
    legalName: "KIAN Privé",
    email: "orders@kianprive.partner",
    displayName: "KIAN Privé Orders",
    clinicCode: "kianprive",
    branding: {
      active: true,
      displayName: "KIAN Privé",
      tagline: "Aesthetic medicine · compounding hub",
      primary: "#1a1a1a",
      secondary: "#2c2c2c",
      accent: "#b8956c",
    },
  },
  {
    site: "facial-design",
    slug: "facial-design-partner",
    legalName: "Facial Design Studio",
    email: "orders@facialdesign.partner",
    displayName: "Facial Design Orders",
    clinicCode: "facialdesign",
    branding: {
      active: true,
      displayName: "Facial Design Studio",
      tagline: "Facial aesthetics · clinic portal",
      primary: "#2f2a26",
      secondary: "#4a4038",
      accent: "#c9a227",
    },
  },
  {
    site: "4everglow",
    slug: "4everglow-partner",
    legalName: "4everglow Wellness",
    email: "orders@4everglow.partner",
    displayName: "4everglow Orders",
    clinicCode: "4everglow",
    branding: {
      active: true,
      displayName: "4everglow",
      tagline: "Wellness therapies · clinic portal",
      primary: "#0d4f4f",
      secondary: "#1a6b6b",
      accent: "#e8b86d",
    },
  },
  {
    site: "threefold-strength",
    slug: "threefold-strength-partner",
    legalName: "Threefold Strength",
    email: "orders@threefold.partner",
    displayName: "Threefold Orders",
    clinicCode: "threefold",
    branding: {
      active: true,
      displayName: "Threefold Strength",
      tagline: "Performance medicine · clinic portal",
      primary: "#1e3a5f",
      secondary: "#2d5080",
      accent: "#d97706",
    },
  },
  {
    site: "hope-and-haven",
    slug: "hope-and-haven-partner",
    legalName: "Hope & Haven International",
    email: "orders@hopeandhaven.partner",
    displayName: "Hope & Haven Orders",
    clinicCode: "hopehaven",
    branding: {
      active: true,
      displayName: "Hope & Haven",
      tagline: "International clinic · compounding hub",
      primary: "#1b4332",
      secondary: "#2d6a4f",
      accent: "#95d5b2",
    },
  },
];

const ALIASES: Record<string, PartnerClinicSite> = {
  "kian-prive": "kian-prive",
  kian: "kian-prive",
  kianprive: "kian-prive",
  "facial-design": "facial-design",
  facial: "facial-design",
  "facial-aesthetics": "facial-design",
  "facial-design-studio": "facial-design",
  "4everglow": "4everglow",
  foreverglow: "4everglow",
  "4ever-glow": "4everglow",
  "threefold-strength": "threefold-strength",
  threefold: "threefold-strength",
  "hope-and-haven": "hope-and-haven",
  hopeandhaven: "hope-and-haven",
};

export function normalizePartnerSite(raw?: string | null): PartnerClinicSite {
  const key = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  return ALIASES[key] || "kian-prive";
}

export function clinicOrgSeed(site: PartnerClinicSite): ClinicOrgSeed {
  return CLINIC_ORGS.find((row) => row.site === site) || CLINIC_ORGS[0];
}

/** Ensure a practice Organization + API placer user for one clinic site. */
export async function ensurePartnerOrgForSite(rawSite?: string | null) {
  const site = normalizePartnerSite(rawSite);
  const seed = clinicOrgSeed(site);

  const brandingJson = JSON.stringify(seed.branding);
  let org = await prisma.organization.findUnique({ where: { slug: seed.slug } });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        type: "practice",
        legalName: seed.legalName,
        slug: seed.slug,
        clinicCode: seed.clinicCode,
        brandingJson,
        verificationTier: 2,
        status: "active",
        onboardingComplete: true,
        assignedRep: seed.legalName,
      },
    });
  } else {
    org = await prisma.organization.update({
      where: { id: org.id },
      data: {
        legalName: seed.legalName,
        status: "active",
        clinicCode: org.clinicCode || seed.clinicCode,
        brandingJson,
        verificationTier: Math.max(org.verificationTier, 2),
        assignedRep: org.assignedRep || seed.legalName,
        onboardingComplete: true,
      },
    });
  }

  let user = await prisma.user.findUnique({ where: { email: seed.email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        orgId: org.id,
        email: seed.email,
        name: seed.displayName,
        roles: JSON.stringify(["owner", "prescriber", "api_client"]),
        mfaHash: await bcrypt.hash(String(randomInt(100000, 999999)), 8),
        mfaEnabled: true,
      },
    });
  } else if (user.orgId !== org.id) {
    user = await prisma.user.update({ where: { id: user.id }, data: { orgId: org.id } });
  }

  return { org, user, site };
}

/** @deprecated Prefer ensurePartnerOrgForSite — kept for call sites that mean KIAN only. */
export async function ensureKianPartnerOrg() {
  return ensurePartnerOrgForSite("kian-prive");
}

/** Create every clinic practice org (idempotent). */
export async function ensureAllPartnerClinicOrgs() {
  const out = [];
  for (const seed of CLINIC_ORGS) {
    out.push(await ensurePartnerOrgForSite(seed.site));
  }
  return out;
}

export function partnerSecretOk(header: string | null) {
  const expected = process.env.WT_PARTNER_ORDER_SECRET?.trim();
  if (!expected || !header) return false;
  const left = Buffer.from(header);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
