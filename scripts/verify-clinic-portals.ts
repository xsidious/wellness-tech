import { prisma } from "../src/lib/prisma";
import { CLINIC_OWNER_SEEDS } from "../src/lib/clinic-account-seeds";
import { eventideConfigured, listPrescribers } from "../src/lib/eventide";

async function main() {
  const orgs = await prisma.organization.findMany({
    where: { clinicCode: { not: "" } },
    select: {
      legalName: true,
      clinicCode: true,
      slug: true,
      brandingJson: true,
      _count: { select: { users: true, orders: true, clinicalPatients: true } },
      users: { select: { email: true, roles: true, name: true } },
    },
    orderBy: { legalName: "asc" },
  });

  const owners = [];
  for (const seed of CLINIC_OWNER_SEEDS) {
    const user = await prisma.user.findUnique({
      where: { email: seed.email },
      select: {
        email: true,
        orgId: true,
        org: { select: { legalName: true, clinicCode: true, slug: true } },
      },
    });
    owners.push({ seed: seed.email, linked: Boolean(user), org: user?.org || null });
  }

  let roster: { ok: boolean; status?: number; count?: number; error?: string } = {
    ok: false,
    error: "not configured",
  };
  if (eventideConfigured()) {
    const result = await listPrescribers();
    const rows = Array.isArray((result.data as { data?: unknown[] })?.data)
      ? ((result.data as { data: unknown[] }).data)
      : Array.isArray(result.data)
        ? (result.data as unknown[])
        : [];
    roster = { ok: result.ok, status: result.status, count: rows.length };
  }

  console.log(
    JSON.stringify(
      {
        clinicOrgs: orgs.map((o) => ({
          legalName: o.legalName,
          clinicCode: o.clinicCode,
          slug: o.slug,
          branded: o.brandingJson.includes('"active":true') || o.brandingJson.includes('"active": true'),
          users: o._count.users,
          orders: o._count.orders,
          patients: o._count.clinicalPatients,
          ownerEmails: o.users.filter((u) => u.roles.includes("owner")).map((u) => u.email),
        })),
        owners,
        vitarelayRoster: roster,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
