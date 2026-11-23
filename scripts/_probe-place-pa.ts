import { placePrescriptionOrder, resolveEventideIssuePlan } from "../src/lib/eventide";
import { prisma } from "../src/lib/prisma";

async function main() {
  const order = await prisma.order.findFirst({
    where: { invoiceNumber: "WT-2026-0020" },
    include: { lines: true },
  });
  if (!order) throw new Error("missing");
  const patient = JSON.parse(order.patientJson);
  const fl = await resolveEventideIssuePlan({ state: "FL" });
  if (!fl.ok || fl.mode !== "own") throw new Error("no FL own");

  const result = await placePrescriptionOrder({
    partnerOrderId: `${order.invoiceNumber}-retry-own`,
    shippingMethod: "2_DAY",
    shippingDestinationType: "patient_direct",
    patient,
    prescriber: fl.prescriber,
    items: order.lines.map((line) => ({
      sku: line.sku,
      platformProductId: line.sku,
      name: line.name,
      quantity: line.qty,
      sig: line.sig || "As directed by Eventide prescribing clinician.",
      dosageForm: line.dosageForm || undefined,
      strength: line.strength || undefined,
      size: line.size || undefined,
    })),
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
