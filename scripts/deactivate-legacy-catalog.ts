import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      sku: true,
      category: true,
      rxcoreFormularyId: true,
      orderable: true,
      active: true,
    },
  });
  let deactivated = 0;
  for (const p of products) {
    const pusa =
      /^PrescribeUSA/i.test(p.category) ||
      /^PUSA-/i.test(p.sku) ||
      /^pusa-/i.test(p.rxcoreFormularyId || "");
    if (pusa) continue;
    if (UUID.test(p.sku) || UUID.test(p.rxcoreFormularyId || "")) continue;
    if (!p.active && !p.orderable) continue;
    await prisma.product.update({
      where: { id: p.id },
      data: {
        active: false,
        orderable: false,
        holdReason: "Not in live VitaRelay/Eventide catalog — blocked to prevent wrong shipment.",
      },
    });
    deactivated += 1;
  }
  const active = await prisma.product.count({ where: { active: true } });
  const orderable = await prisma.product.count({ where: { active: true, orderable: true } });
  const fox = await prisma.product.findMany({
    where: { OR: [{ sku: "AA-FOX" }, { name: { contains: "FOX", mode: "insensitive" } }] },
    select: { sku: true, name: true, active: true, orderable: true, rxcoreFormularyId: true },
    take: 10,
  });
  console.log(JSON.stringify({ deactivated, active, orderable, fox }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
