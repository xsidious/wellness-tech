/** One-shot: mark the latest live smoke order as awaiting_payment with clear ops note. */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const NOTE =
  "VitaRelay order created — awaiting practice payment on the VitaRelay/Eventide account (card on file). Compounding starts after that clears.";

const order = await prisma.order.findFirst({
  where: {
    OR: [
      { eventideOrderId: "3ab825bb-21b1-4217-996c-bd235a6ec270" },
      { invoiceNumber: "WT-KIAN-00012" },
    ],
  },
});

if (!order) {
  console.log(JSON.stringify({ ok: false, error: "Order not found locally" }));
  process.exit(0);
}

const updated = await prisma.order.update({
  where: { id: order.id },
  data: { status: "awaiting_payment", splitMessage: NOTE },
});

console.log(
  JSON.stringify(
    {
      ok: true,
      id: updated.id,
      invoice: updated.invoiceNumber,
      status: updated.status,
      eventideOrderId: updated.eventideOrderId,
    },
    null,
    2,
  ),
);
await prisma.$disconnect();
