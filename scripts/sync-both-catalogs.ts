import { syncPrescribeUsaCatalog, syncEventideFormulary } from "../src/lib/formulary-sync";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("Syncing Eventide…");
  const eventide = await syncEventideFormulary("script");
  console.log(JSON.stringify(eventide));
  if (!eventide.ok) process.exitCode = 1;

  console.log("Syncing PrescribeUSA…");
  const pusa = await syncPrescribeUsaCatalog("script");
  console.log(JSON.stringify(pusa));

  const products = await prisma.product.findMany({ select: { category: true } });
  const eventideCount = products.filter((p) => p.category.startsWith("Eventide")).length;
  const pusaCount = products.filter((p) => p.category.startsWith("PrescribeUSA")).length;
  console.log(JSON.stringify({ total: products.length, eventideProducts: eventideCount, prescribeUsaProducts: pusaCount }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "sync failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
