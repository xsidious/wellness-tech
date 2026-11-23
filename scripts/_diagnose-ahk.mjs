import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const prod = await prisma.product.findFirst({
    where: { sku: "119df359-ebf4-4c6a-8084-64cdadac5853" },
  });
  console.log("product", JSON.stringify(prod, null, 2));
  const classes = await prisma.product.groupBy({ by: ["productClass"], _count: true });
  console.log("classes", classes);
  const ahk = await prisma.product.findMany({
    where: { name: { contains: "AHK", mode: "insensitive" } },
    select: {
      sku: true,
      name: true,
      productClass: true,
      rxRequired: true,
      rxcoreFormularyId: true,
      orderable: true,
      active: true,
    },
  });
  console.log("ahk", ahk);
  const uuidLike503 = await prisma.product.count({
    where: { productClass: { in: ["503A", "503B"] }, sku: { contains: "-" } },
  });
  const uuidLikeRnd = await prisma.product.count({
    where: { productClass: "RND", sku: { contains: "-" } },
  });
  console.log({ uuidLike503, uuidLikeRnd });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
