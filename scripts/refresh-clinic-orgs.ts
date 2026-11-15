import { ensureAllPartnerClinicOrgs } from "../src/lib/partner-org";
import { prisma } from "../src/lib/prisma";

async function main() {
  const rows = await ensureAllPartnerClinicOrgs();
  console.log(
    rows.map((r) => ({
      site: r.site,
      code: r.org.clinicCode,
      brand: r.org.brandingJson.slice(0, 100),
    })),
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
