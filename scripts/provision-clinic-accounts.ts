/**
 * Ensure each partner clinic org exists with branding + a human owner login.
 *
 * Usage:
 *   npx tsx scripts/provision-clinic-accounts.ts
 *   npx tsx scripts/provision-clinic-accounts.ts --reset
 */
import { provisionClinicPortalAccounts } from "../src/lib/clinic-accounts";

async function main() {
  const resetPasswords = process.argv.includes("--reset");
  const rows = await provisionClinicPortalAccounts({ resetPasswords });
  console.log(JSON.stringify({ resetPasswords, count: rows.length, accounts: rows }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  });
