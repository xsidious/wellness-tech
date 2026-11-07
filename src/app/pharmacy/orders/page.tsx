import Link from "next/link";
import { PageHeader, SectionCard, StatusBadge, statusTone } from "@/components/portal/Workspace";
import { money } from "@/lib/money";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export default async function PharmacyOrdersPage() {
  const user = await requireUser();
  const orders = await prisma.order.findMany({
    where: user.pharmacyId ? { pharmacyId: user.pharmacyId } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { org: true, clinicalPatient: true },
  });

  return (
    <div className="ws-stack">
      <PageHeader kicker="Fulfillment" title="All pharmacy orders" lede="Full history for your network locations." />
      <SectionCard title={`${orders.length} orders`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Practice</th>
                <th>Status</th>
                <th>Tracking</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/pharmacy/orders/${o.id}`}>{o.invoiceNumber}</Link>
                  </td>
                  <td>{o.org.legalName}</td>
                  <td>
                    <StatusBadge tone={statusTone(o.status)}>{o.status}</StatusBadge>
                  </td>
                  <td className="muted">{o.trackingNumber || "—"}</td>
                  <td>{money(o.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
