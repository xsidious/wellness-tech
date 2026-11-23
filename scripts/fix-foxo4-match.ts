import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: "FOXO4", mode: "insensitive" } },
        { sku: { contains: "FOXO", mode: "insensitive" } },
        { name: { contains: "foxo", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      sku: true,
      name: true,
      rxcoreFormularyId: true,
      productClass: true,
      category: true,
      active: true,
      orderable: true,
    },
  });
  console.log(JSON.stringify({ count: rows.length, rows }, null, 2));

  const uuidLike = await prisma.product.count({
    where: { rxcoreFormularyId: { not: "" } },
  });
  const uuidSku = await prisma.product.count({
    where: { sku: { contains: "-" } },
  });
  const sample = await prisma.product.findMany({
    where: { active: true, category: { startsWith: "Eventide" } },
    take: 8,
    select: { sku: true, name: true, rxcoreFormularyId: true },
    orderBy: { name: "asc" },
  });
  console.log(JSON.stringify({ withFormularyId: uuidLike, sample }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
