import { PHARMACY_NETWORK } from "@/lib/pharmacy-network";
import { prisma } from "@/lib/prisma";

/** Seed default network partners if the Pharmacy table is empty. */
export async function ensurePharmacyNetwork() {
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
