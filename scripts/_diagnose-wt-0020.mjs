import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const order = await prisma.order.findFirst({
    where: { invoiceNumber: "WT-2026-0020" },
    include: {
      lines: true,
      events: { orderBy: { createdAt: "desc" }, take: 10 },
      clinicalPatient: true,
    },
  });
  if (!order) {
    console.log("ORDER_NOT_IN_DB");
    return;
  }
  console.log(
    JSON.stringify(
      {
        id: order.id,
        invoice: order.invoiceNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        escriptStatus: order.escriptStatus,
        source: order.source,
        shipDestination: order.shipDestination,
        rxcoreOrderId: order.rxcoreOrderId,
        eventideOrderId: order.eventideOrderId,
        eventideBatchId: order.eventideBatchId,
        placementError: order.placementError,
        splitMessage: order.splitMessage,
        pharmacyId: order.pharmacyId,
        clinicalPatientId: order.clinicalPatientId,
        patientName: order.clinicalPatient?.fullName,
        patientEmail: order.clinicalPatient?.email,
        patientJsonLen: (order.patientJson || "").length,
        patientJsonPreview: (order.patientJson || "").slice(0, 400),
        shipToJson: order.shipToJson,
        lastWebhookAt: order.lastWebhookAt,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        lines: order.lines.map((l) => ({
          sku: l.sku,
          name: l.name,
          productClass: l.productClass,
          qty: l.qty,
          patientInitials: l.patientInitials,
          lineStatus: l.lineStatus,
          routedSource: l.routedSource,
        })),
        events: order.events.map((e) => ({
          type: e.type,
          eventId: e.eventId,
          createdAt: e.createdAt,
          payloadPreview: (e.payload || "").slice(0, 240),
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
