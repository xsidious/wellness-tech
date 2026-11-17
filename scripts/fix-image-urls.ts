import { prisma } from "../src/lib/prisma";

/** Live Eventide CDN assets (verified HTTP 200). */
const CDN = {
  powder:
    "https://vitarelay.com/__l5e/assets-v1/0cffe580-da37-48f8-b0d1-5a07027e056b/lyophilized-powder.png",
  pen: "https://vitarelay.com/__l5e/assets-v1/7a5eff76-3f46-4d87-8a50-de34ef7f27ff/injection-pen.png",
  serum: "https://vitarelay.com/__l5e/assets-v1/93425fa8-8402-43ab-ba6b-edf2329a9d39/serum-bottle.png",
} as const;

async function main() {
  const powder = await prisma.product.updateMany({
    where: {
      OR: [
        { imageUrl: "/vendor/eventide/lyophilized-powder.png" },
        { imageUrl: { contains: "lyophilized-powder" } },
      ],
    },
    data: { imageUrl: CDN.powder },
  });
  const pen = await prisma.product.updateMany({
    where: {
      OR: [
        { imageUrl: "/vendor/eventide/injection-pen.png" },
        { imageUrl: { contains: "injection-pen" } },
        { category: { startsWith: "PrescribeUSA" } },
      ],
    },
    data: { imageUrl: CDN.pen },
  });
  const serum = await prisma.product.updateMany({
    where: {
      OR: [
        { imageUrl: "/vendor/eventide/serum-bottle.png" },
        { imageUrl: { contains: "serum-bottle" } },
      ],
    },
    data: { imageUrl: CDN.serum },
  });

  // Anything still on a local vendor path or empty Eventide/PrescribeUSA row
  const remaining = await prisma.product.findMany({
    where: {
      active: true,
      OR: [
        { category: { startsWith: "Eventide" } },
        { category: { startsWith: "PrescribeUSA" } },
        { productClass: { in: ["503A", "503B", "RND"] } },
      ],
      AND: [
        {
          OR: [
            { imageUrl: "" },
            { imageUrl: { startsWith: "/vendor/" } },
            { imageUrl: { startsWith: "/images/" } },
          ],
        },
      ],
    },
    select: { id: true, name: true, form: true, category: true },
  });

  let filled = 0;
  for (const p of remaining) {
    const blob = `${p.name} ${p.form} ${p.category}`.toLowerCase();
    const url = /pen|prescribeusa|pre-filled/.test(blob)
      ? CDN.pen
      : /serum|topical|cream|gel|supply|syringe|bag/.test(blob)
        ? CDN.serum
        : CDN.powder;
    await prisma.product.update({ where: { id: p.id }, data: { imageUrl: url } });
    filled += 1;
  }

  const sample = await prisma.product.findMany({
    where: { imageUrl: { startsWith: "https://vitarelay.com/" } },
    take: 3,
    select: { name: true, imageUrl: true },
  });
  const brokenLocal = await prisma.product.count({
    where: { imageUrl: { startsWith: "/vendor/" } },
  });

  console.log(JSON.stringify({ powder: powder.count, pen: pen.count, serum: serum.count, filled, brokenLocal, sample }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
