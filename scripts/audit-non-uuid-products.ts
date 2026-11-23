import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const active = await prisma.product.findMany({
    where: { active: true },
    select: {
      sku: true,
      name: true,
      rxcoreFormularyId: true,
      category: true,
      productClass: true,
      orderable: true,
    },
  });
  const bad = active.filter((p) => !UUID.test(p.sku) && !UUID.test(p.rxcoreFormularyId || ""));
  const good = active.filter((p) => UUID.test(p.sku) || UUID.test(p.rxcoreFormularyId || ""));
  const prescribe = active.filter((p) => /^PrescribeUSA/i.test(p.category) || /^pusa-/i.test(p.rxcoreFormularyId || ""));
  console.log(
    JSON.stringify(
      {
        active: active.length,
        withUuid: good.length,
        withoutUuid: bad.length,
        prescribeUsa: prescribe.length,
        sampleBad: bad.slice(0, 40).map((p) => ({
          sku: p.sku,
          name: p.name,
          formulary: p.rxcoreFormularyId,
          category: p.category,
          orderable: p.orderable,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
