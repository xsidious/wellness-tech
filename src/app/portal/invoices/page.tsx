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

export default async function InvoicesPage() {
  const user = await requireUser();
  const orders = await prisma.order.findMany({
    where: { orgId: user.orgId },
    orderBy: { createdAt: "desc" },
  });
  const paidCents = orders
    .filter((o) => o.paymentStatus === "paid")
    .reduce((sum, o) => sum + o.totalCents, 0);

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Billing"
        title="Invoices"
        lede="Practice invoices with payment status, card on file last-four, and totals. Open any row for line-item detail."
        actions={
          <Link className="btn btn-ghost" href="/portal/orders">
            Fulfillment queue
          </Link>
        }
      />

      <div className="ws-stat-grid">
        <StatTile label="Invoices" value={orders.length} />
        <StatTile label="Paid volume" value={money(paidCents)} tone="ok" />
      </div>

      <SectionCard title="Invoice register">
        {orders.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Payment</th>
                  <th>Card</th>
                  <th>Subtotal</th>
                  <th>Shipping</th>
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
                    </td>
                    <td>
                      <StatusBadge tone={statusTone(order.paymentStatus)}>{order.paymentStatus}</StatusBadge>
                    </td>
                    <td className="muted">{order.cardLast4 ? `•••• ${order.cardLast4}` : "—"}</td>
                    <td>{money(order.subtotalCents)}</td>
                    <td>{money(order.shippingFeeCents)}</td>
                    <td>
                      <b>{money(order.totalCents)}</b>
                    </td>
                    <td className="muted">{order.createdAt.toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No invoices" body="Invoices appear when orders are placed." />
        )}
      </SectionCard>
    </div>
  );
}
