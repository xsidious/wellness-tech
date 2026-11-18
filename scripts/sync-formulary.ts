import { syncEventideFormulary } from "../src/lib/formulary-sync";
import { prisma } from "../src/lib/prisma";

async function main() {
  const result = await syncEventideFormulary("script");
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "sync failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
