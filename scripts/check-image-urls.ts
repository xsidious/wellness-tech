import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.product.findMany({
    take: 8,
    where: { active: true },
    select: { name: true, imageUrl: true },
    orderBy: { name: "asc" },
  });
  const vendor = await prisma.product.count({
    where: { imageUrl: { startsWith: "/vendor" } },
  });
  const cdn = await prisma.product.count({
    where: { imageUrl: { startsWith: "https://vitarelay.com/" } },
  });
  const nullish = await prisma.product.count({
    where: { imageUrl: null },
  });
  const urls = [
    ...new Set(
      (
        await prisma.product.findMany({
          where: { active: true, imageUrl: { not: null } },
          select: { imageUrl: true },
        })
      )
        .map((r) => r.imageUrl)
        .filter(Boolean) as string[],
    ),
  ];
  console.log(JSON.stringify({ vendor, cdn, nullish, uniqueUrls: urls, sample: rows }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
