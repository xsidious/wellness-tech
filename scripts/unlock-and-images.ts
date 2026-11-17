import { syncPrescribeUsaCatalog, syncRxHereFormulary } from "../src/lib/formulary-sync";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("Making every active product orderable…");
  const unlocked = await prisma.product.updateMany({
    where: { active: true },
    data: { orderable: true, holdReason: "" },
  });
  console.log(JSON.stringify({ unlocked: unlocked.count }));

  console.log("Syncing Eventide (prices + images)…");
  const eventide = await syncRxHereFormulary("script");
  console.log(JSON.stringify(eventide));

  console.log("Syncing PrescribeUSA…");
  const pusa = await syncPrescribeUsaCatalog("script");
  console.log(JSON.stringify(pusa));

  const withImages = await prisma.product.count({
    where: { active: true, imageUrl: { not: "" } },
  });
  const notOrderable = await prisma.product.count({
    where: { active: true, orderable: false },
  });
  console.log(JSON.stringify({ withImages, notOrderable }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
