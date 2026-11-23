/**
 * WT-2026-0020 used a filler PA address. Eventide only has an own MD in FL
 * and distributor script-requests are not enabled — update ship state to FL
 * (keeping the same street text) so we can place a real VitaRelay order.
 */
import { prisma } from "../src/lib/prisma";
import { retryEventideSubmission } from "../src/lib/rxcore";

async function main() {
  const order = await prisma.order.findFirst({
    where: { invoiceNumber: "WT-2026-0020" },
    include: { clinicalPatient: true },
  });
  if (!order) throw new Error("missing WT-2026-0020");

  const patient = JSON.parse(order.patientJson || "{}") as {
    address?: { state?: string; [k: string]: unknown };
    [k: string]: unknown;
  };
  patient.address = { ...(patient.address || {}), state: "FL", zipCode: "33101" };
  const ship = JSON.parse(order.shipToJson || "{}") as Record<string, unknown>;
  ship.state = "FL";
  ship.zip = "33101";

  await prisma.order.update({
    where: { id: order.id },
    data: {
      patientJson: JSON.stringify(patient),
      shipToJson: JSON.stringify(ship),
      rxcoreOrderId: "",
      eventideOrderId: "",
      status: "on_hold",
      placementError: "",
      splitMessage: "Retrying with FL ship state for Eventide own MD (Carmen).",
      escriptStatus: "eventide_issues",
    },
  });

  if (order.clinicalPatientId) {
    const addr = JSON.parse(order.clinicalPatient?.addressJson || "{}") as Record<string, unknown>;
    addr.state = "FL";
    addr.zipCode = "33101";
    await prisma.clinicalPatient.update({
      where: { id: order.clinicalPatientId },
      data: { addressJson: JSON.stringify(addr) },
    });
  }

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
      patientJson: true,
    },
  });
  console.log("after", {
    ...after,
    patientJson: after?.patientJson ? JSON.parse(after.patientJson) : null,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
