import { refreshOrderFromEventide } from "../src/lib/eventide";
import { prisma } from "../src/lib/prisma";

async function main() {
  const order = await prisma.order.findFirst({ where: { invoiceNumber: "WT-2026-0020" } });
  if (!order) throw new Error("missing");
  console.log("remote", order.eventideOrderId || order.rxcoreOrderId);
  console.log(await refreshOrderFromEventide(order.id));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
