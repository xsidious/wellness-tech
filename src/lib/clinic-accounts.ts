import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { CLINIC_OWNER_SEEDS } from "@/lib/clinic-account-seeds";
import {
  ensureAllPartnerClinicOrgs,
  ensurePartnerOrgForSite,
  type PartnerClinicSite,
} from "@/lib/partner-org";
import { ensureConnectedSites } from "@/lib/connected-sites";

export type { ClinicOwnerSeed } from "@/lib/clinic-account-seeds";
export { CLINIC_OWNER_SEEDS } from "@/lib/clinic-account-seeds";

function tempPassword(clinicCode: string) {
  return `WtClinic#${clinicCode.slice(0, 8)}${randomInt(100, 999)}!`;
}

function tempPin() {
  return String(randomInt(100000, 999999));
}

export type ProvisionedClinicAccount = {
  site: PartnerClinicSite;
  orgId: string;
  orgSlug: string;
  legalName: string;
  clinicCode: string;
  email: string;
  name: string;
  password: string;
  pin: string;
  created: boolean;
  reset: boolean;
  loginUrl: string;
};

/**
 * Ensure each partner clinic org exists, has a clinic code, and a real owner login.
 * Pass `resetPasswords: true` to rotate credentials for existing owners.
 */
export async function provisionClinicPortalAccounts(options?: {
  resetPasswords?: boolean;
  actorId?: string;
}): Promise<ProvisionedClinicAccount[]> {
  await ensureAllPartnerClinicOrgs();
  await ensureConnectedSites();

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://www.wellnesstechdistribution.com").replace(
    /\/$/,
    "",
  );
  const out: ProvisionedClinicAccount[] = [];

  for (const seed of CLINIC_OWNER_SEEDS) {
    const { org } = await ensurePartnerOrgForSite(seed.site);
    const clinicCode = seed.clinicCode.toLowerCase();
    if (org.clinicCode !== clinicCode) {
      await prisma.organization.update({
        where: { id: org.id },
        data: {
          clinicCode,
          onboardingComplete: true,
          status: "active",
          verificationTier: Math.max(org.verificationTier, 2),
        },
      });
    }

    let user = await prisma.user.findUnique({ where: { email: seed.email } });
    const password = tempPassword(clinicCode);
    const pin = tempPin();
    let created = false;
    let reset = false;

    if (!user) {
      user = await prisma.user.create({
        data: {
          orgId: org.id,
          email: seed.email,
          name: seed.name,
          roles: JSON.stringify(["owner", "prescriber"]),
          passwordHash: await bcrypt.hash(password, 12),
          mfaHash: await bcrypt.hash(pin, 12),
          mfaEnabled: true,
        },
      });
      created = true;
    } else {
      const patch: {
        orgId?: string;
        name?: string;
        roles?: string;
        passwordHash?: string;
        mfaHash?: string;
        mfaEnabled?: boolean;
      } = {};
      if (user.orgId !== org.id) patch.orgId = org.id;
      if (user.name !== seed.name) patch.name = seed.name;
      const roles = (() => {
        try {
          return JSON.parse(user.roles) as string[];
        } catch {
          return [];
        }
      })();
      if (!roles.includes("owner") || !roles.includes("prescriber")) {
        patch.roles = JSON.stringify(Array.from(new Set([...roles, "owner", "prescriber"])));
      }
      if (options?.resetPasswords || !user.passwordHash) {
        patch.passwordHash = await bcrypt.hash(password, 12);
        patch.mfaHash = await bcrypt.hash(pin, 12);
        patch.mfaEnabled = true;
        reset = true;
      }
      if (Object.keys(patch).length) {
        user = await prisma.user.update({ where: { id: user.id }, data: patch });
      }
    }

    if (options?.actorId) {
      await audit({
        actorId: options.actorId,
        action: created ? "clinic.owner_created" : "clinic.owner_linked",
        object: org.id,
        after: `${seed.site}:${seed.email}`,
      });
    }

    out.push({
      site: seed.site,
      orgId: org.id,
      orgSlug: org.slug,
      legalName: org.legalName,
      clinicCode,
      email: seed.email,
      name: seed.name,
      password: created || reset ? password : "(unchanged — use resetPasswords to rotate)",
      pin: created || reset ? pin : "(unchanged)",
      created,
      reset,
      loginUrl: `${appUrl}/login`,
    });
  }

  return out;
}

/** Resolve an Organization by clinic join code. */
export async function findOrgByClinicCode(code: string) {
  const clinicCode = String(code || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  if (!clinicCode) return null;
  return prisma.organization.findFirst({
    where: {
      OR: [{ clinicCode }, { clinicCode: { equals: clinicCode, mode: "insensitive" } }],
      status: "active",
      type: { in: ["practice", "clinical"] },
    },
  });
}
