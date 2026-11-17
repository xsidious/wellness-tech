/**
 * Delete unreferenced legacy products (not Eventide UUID, not PrescribeUSA).
 * Referenced SKUs (OrderLine / CartItem / RxFavorite / CoaDocument) stay inactive.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPrescribeUsa(category: string, sku: string, formulary: string) {
  return (
    /^PrescribeUSA/i.test(category) ||
    /^PUSA-/i.test(sku) ||
    /^pusa-/i.test(formulary)
  );
}

function isEventide(sku: string, formulary: string) {
  return UUID.test(sku) || UUID.test(formulary);
}

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, sku: true, category: true, rxcoreFormularyId: true, name: true },
  });
  const legacy = products.filter(
    (p) => !isEventide(p.sku, p.rxcoreFormularyId || "") && !isPrescribeUsa(p.category, p.sku, p.rxcoreFormularyId || ""),
  );

  const skus = legacy.map((p) => p.sku);
  const [cartRefs, lineRefs, favRefs, coaRefs] = await Promise.all([
    prisma.cartItem.findMany({
      where: { productId: { in: legacy.map((p) => p.id) } },
      select: { productId: true },
    }),
    prisma.orderLine.findMany({
      where: { sku: { in: skus } },
      select: { sku: true },
      distinct: ["sku"],
    }),
    prisma.rxFavorite.findMany({
      where: { sku: { in: skus } },
      select: { sku: true },
      distinct: ["sku"],
    }),
    prisma.coaDocument.findMany({
      where: { sku: { in: skus } },
      select: { sku: true },
      distinct: ["sku"],
    }),
  ]);

  const referencedIds = new Set(cartRefs.map((c) => c.productId));
  const referencedSkus = new Set([
    ...lineRefs.map((r) => r.sku),
    ...favRefs.map((r) => r.sku),
    ...coaRefs.map((r) => r.sku),
  ]);

  let deleted = 0;
  let keptInactive = 0;

  for (const product of legacy) {
    const referenced = referencedIds.has(product.id) || referencedSkus.has(product.sku);
    if (referenced) {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          active: false,
          orderable: false,
          holdReason: "Legacy catalog SKU — kept for order history only.",
        },
      });
      keptInactive += 1;
      continue;
    }
    await prisma.product.delete({ where: { id: product.id } });
    deleted += 1;
  }

  const remaining = await prisma.product.count();
  const eventide = await prisma.product.count({
    where: { OR: [{ sku: { contains: "-" } }] },
  });
  console.log(
    JSON.stringify(
      {
        legacyFound: legacy.length,
        deleted,
        keptInactive,
        remainingProducts: remaining,
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
