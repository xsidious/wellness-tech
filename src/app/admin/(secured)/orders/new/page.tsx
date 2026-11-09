import Link from "next/link";
import { AdminCreateOrderForm } from "@/components/admin/AdminCreateOrderForm";
import { PageHeader } from "@/components/portal/Workspace";
import { ensureKianPartnerOrg } from "@/lib/partner-org";
import { prisma } from "@/lib/prisma";

export default async function AdminCreateOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  await ensureKianPartnerOrg();
  const [orgs, patients, products] = await Promise.all([
    prisma.organization.findMany({
      orderBy: { legalName: "asc" },
      select: { id: true, legalName: true, slug: true },
    }),
    prisma.clinicalPatient.findMany({
      orderBy: { updatedAt: "desc" },
      take: 300,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        dateOfBirth: true,
        orgId: true,
        org: { select: { legalName: true } },
      },
    }),
    prisma.product.findMany({
      where: { active: true },
      orderBy: [{ productClass: "asc" }, { name: "asc" }],
      select: {
        id: true,
        sku: true,
        name: true,
        productClass: true,
        category: true,
        priceCents: true,
        active: true,
        orderable: true,
        rxRequired: true,
        holdReason: true,
      },
    }),
  ]);

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Fulfillment"
        title="Create order"
        lede="Admin desk with the full formulary — existing or new patient, any active SKU, wholesale pricing."
        actions={
          <Link className="btn btn-ghost" href="/admin/orders">
            ← Orders
          </Link>
        }
      />
      <AdminCreateOrderForm
        orgs={orgs}
        patients={patients.map((patient) => ({
          id: patient.id,
          fullName: patient.fullName,
          email: patient.email,
          phone: patient.phone,
          dateOfBirth: patient.dateOfBirth,
          orgId: patient.orgId,
          orgName: patient.org.legalName,
        }))}
        products={products}
        error={error}
      />
    </div>
  );
}
