import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatTile,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { requireUser } from "@/lib/guard";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function OrdersPage() {
  const user = await requireUser();
  const orders = await prisma.order.findMany({
    where: { orgId: user.orgId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { lines: true } }, clinicalPatient: true },
  });

  const open = orders.filter((o) => o.status !== "delivered").length;
  const paid = orders.filter((o) => o.paymentStatus === "paid").length;

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Fulfillment"
        title="Orders"
        lede="Every practice and partner invoice — prescription lines, pharmacy IDs, and shipment status."
        actions={
          <Link className="btn btn-accent" href="/portal/catalog">
            New order
          </Link>
        }
      />

      <div className="ws-stat-grid">
        <StatTile label="Total orders" value={orders.length} />
        <StatTile label="Open" value={open} tone="accent" />
        <StatTile label="Paid" value={paid} tone="ok" />
      </div>

      <SectionCard title="Order queue" description="Click an invoice to open patient details, signatures, and pharmacy routing.">
        {orders.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Patient</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Fulfillment</th>
                  <th>Lines</th>
                  <th>Total</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/portal/orders/${order.id}`}>
                        <b>{order.invoiceNumber}</b>
                      </Link>
                      {order.partnerExternalRef ? (
                        <div className="muted">KIAN {order.partnerExternalRef}</div>
                      ) : null}
                    </td>
                    <td>
                      {order.clinicalPatient ? (
                        <Link href={`/portal/patients/${order.clinicalPatient.id}`}>
                          {order.clinicalPatient.fullName}
                        </Link>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
                    </td>
                    <td>
                      <StatusBadge tone={statusTone(order.paymentStatus)}>{order.paymentStatus}</StatusBadge>
                    </td>
                    <td className="muted">
                      {order.rxhereOrderId || order.rxcoreOrderId || order.trackingNumber || "—"}
                    </td>
                    <td>{order._count.lines}</td>
                    <td>{money(order.totalCents)}</td>
                    <td className="muted">{order.createdAt.toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No orders yet"
            body="Place a catalog order or wait for KIAN to forward a paid therapeutics order."
            action={
              <Link className="btn btn-accent" href="/portal/catalog">
                Open catalog
              </Link>
            }
          />
        )}
      </SectionCard>
    </div>
  );
}
