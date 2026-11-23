import { prisma } from "../src/lib/prisma";

async function main() {
  const priced = await prisma.product.count({ where: { priceCents: { gt: 0 } } });
  const sample = await prisma.product.findMany({
    where: { priceCents: { gt: 0 } },
    take: 5,
    orderBy: { name: "asc" },
    select: { name: true, priceCents: true, productClass: true },
  });
  console.log(JSON.stringify({ priced, sample }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
