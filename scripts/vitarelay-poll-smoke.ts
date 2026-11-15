import { prisma } from "../src/lib/prisma";
import { getOrderStatus, refreshOrderFromEventide } from "../src/lib/eventide";

async function main() {
  const order = await prisma.order.findFirst({
    where: { rxhereOrderId: { not: "" } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      invoiceNumber: true,
      rxhereOrderId: true,
      status: true,
      trackingNumber: true,
    },
  });
  console.log("latest", order);
  if (!order?.rxhereOrderId) {
    console.log("No prior VitaRelay order to poll — live placement deferred (no vr_test_ key).");
    return;
  }
  const remote = await getOrderStatus(order.rxhereOrderId);
  console.log("remote", { ok: remote.ok, status: remote.status, data: remote.data });
  const refreshed = await refreshOrderFromEventide(order.id);
  console.log("refreshed", refreshed);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
