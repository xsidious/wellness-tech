import { PHARMACY_NETWORK } from "@/lib/pharmacy-network";
import { prisma } from "@/lib/prisma";

/** Seed default network partners if the Pharmacy table is empty. */
export async function ensurePharmacyNetwork() {
  // Strip any residual legacy pharmacy branding from retired partners.
  await prisma.pharmacy.updateMany({
    where: {
      OR: [
        { name: { contains: "RxHere", mode: "insensitive" } },
        { name: { equals: "Rx Here", mode: "insensitive" } },
      ],
    },
    data: {
      name: "Eventide / VitaRelay Network",
      description:
        "Primary Wellness Tech fulfillment lane. Orders route to Eventide physicians and Eventide pharmacies via VitaRelay.",
      erpJson: JSON.stringify(["VitaRelay Practice API", "Eventide fulfillment"]),
    },
  });

  const count = await prisma.pharmacy.count();
  if (count > 0) return prisma.pharmacy.findMany({ orderBy: { name: "asc" } });

  await prisma.pharmacy.createMany({
    data: PHARMACY_NETWORK.map((p) => ({
      name: p.name,
      type: p.type,
      region: p.region,
      status: p.status,
      specialtiesJson: JSON.stringify(p.specialties),
      capabilitiesJson: JSON.stringify(p.capabilities),
      erpJson: JSON.stringify(p.erp),
      sla: p.sla,
      description: p.description,
    })),
  });

  return prisma.pharmacy.findMany({ orderBy: { name: "asc" } });
}
