/**
 * Move existing partner orders/patients from the shared KIAN bucket into
 * each clinic's own Organization, keyed by Order.source / ClinicalPatient.sourceSite.
 *
 * Safe: updates orgId only — no deletes.
 */
import { prisma } from "../src/lib/prisma";
import { ensureAllPartnerClinicOrgs, normalizePartnerSite } from "../src/lib/partner-org";
import { ensureConnectedSites } from "../src/lib/connected-sites";

async function main() {
  const clinics = await ensureAllPartnerClinicOrgs();
  await ensureConnectedSites();
  const bySite = new Map(clinics.map((c) => [c.site, c.org.id]));

  const shared = await prisma.organization.findUnique({ where: { slug: "kian-prive-partner" } });
  if (!shared) {
    console.log("No shared kian-prive-partner org — nothing to reassign.");
    return;
  }

  const orders = await prisma.order.findMany({
    where: { orgId: shared.id, source: { not: "" } },
    select: { id: true, source: true, invoiceNumber: true },
  });

  let movedOrders = 0;
  for (const order of orders) {
    const site = normalizePartnerSite(order.source);
    if (site === "kian-prive") continue;
    const orgId = bySite.get(site);
    if (!orgId || orgId === shared.id) continue;
    await prisma.order.update({ where: { id: order.id }, data: { orgId } });
    movedOrders += 1;
    console.log(`order ${order.invoiceNumber} → ${site}`);
  }

  const patients = await prisma.clinicalPatient.findMany({
    where: { orgId: shared.id, sourceSite: { not: "" } },
    select: { id: true, sourceSite: true, email: true },
  });

  let movedPatients = 0;
  for (const patient of patients) {
    const site = normalizePartnerSite(patient.sourceSite);
    if (site === "kian-prive") continue;
    const orgId = bySite.get(site);
    if (!orgId || orgId === shared.id) continue;
    // Unique constraint is orgId+email+kianIntakeId — skip if already exists in target.
    try {
      await prisma.clinicalPatient.update({ where: { id: patient.id }, data: { orgId } });
      movedPatients += 1;
      console.log(`patient ${patient.email} → ${site}`);
    } catch (error) {
      console.warn(`skip patient ${patient.email}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log(JSON.stringify({ movedOrders, movedPatients, clinics: clinics.map((c) => c.site) }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
