import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const o = await p.order.update({
  where: { id: "cmwjwf6xd0008l507podn23uq" },
  data: { status: "awaiting_payment" },
});
console.log(JSON.stringify({ id: o.id, invoice: o.invoiceNumber, status: o.status, rx: o.eventideOrderId }));
await p.$disconnect();
