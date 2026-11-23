import { retryEventideSubmission } from "../src/lib/rxcore";
import { prisma } from "../src/lib/prisma";

async function main() {
  const order = await prisma.order.findFirst({ where: { invoiceNumber: "WT-2026-0020" } });
  if (!order) {
    console.log("missing order");
    return;
  }
  console.log("before", {
    id: order.id,
    status: order.status,
    rxcoreOrderId: order.rxcoreOrderId,
    eventideOrderId: order.eventideOrderId,
    placementError: order.placementError,
  });

  const result = await retryEventideSubmission(order.id);
  console.log("retry", result);

  const after = await prisma.order.findUnique({
    where: { id: order.id },
    select: {
      status: true,
      rxcoreOrderId: true,
      eventideOrderId: true,
      placementError: true,
      splitMessage: true,
      escriptStatus: true,
    },
  });
  console.log("after", after);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
