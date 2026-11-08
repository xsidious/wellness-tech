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
import { trackingHref } from "@/lib/tracking";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; escript?: string; payment?: string }>;
}) {
  const user = await requireUser();
  const { q, status, escript, payment } = await searchParams;
  const query = (q || "").trim();

  const orders = await prisma.order.findMany({
    where: {
      orgId: user.orgId,
      ...(status ? { status } : {}),
      ...(escript ? { escriptStatus: escript } : {}),
      ...(payment ? { paymentStatus: payment } : {}),
      ...(query
        ? {
            OR: [
              { invoiceNumber: { contains: query, mode: "insensitive" } },
              { partnerExternalRef: { contains: query, mode: "insensitive" } },
              { trackingNumber: { contains: query, mode: "insensitive" } },
              { rxhereOrderId: { contains: query, mode: "insensitive" } },
              { clinicalPatient: { fullName: { contains: query, mode: "insensitive" } } },
              { clinicalPatient: { email: { contains: query, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { _count: { select: { lines: true } }, clinicalPatient: true, pharmacy: true },
  });

  const open = orders.filter((o) => o.status !== "delivered").length;
  const paid = orders.filter((o) => o.paymentStatus === "paid").length;
  const exportQs = new URLSearchParams();
  if (status) exportQs.set("status", status);
  if (escript) exportQs.set("escript", escript);
  if (payment) exportQs.set("payment", payment);
  if (query) exportQs.set("q", query);

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Fulfillment"
        title="Orders"
        lede="Every practice and partner invoice — prescription lines, pharmacy IDs, and shipment status."
        actions={
          <div className="ws-head-actions">
            <Link className="btn btn-ghost" href={`/portal/orders/export${exportQs.toString() ? `?${exportQs}` : ""}`}>
              Export CSV
            </Link>
            <Link className="btn btn-accent" href="/portal/catalog">
              New order
            </Link>
          </div>
        }
      />

      <div className="ws-stat-grid">
        <StatTile label="Showing" value={orders.length} />
        <StatTile label="Open" value={open} tone="accent" />
        <StatTile label="Paid" value={paid} tone="ok" />
      </div>

      <SectionCard title="Filter">
        <form className="ws-message-form" style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <input name="q" defaultValue={query} placeholder="Invoice, patient, tracking…" style={{ minWidth: 240 }} />
          <select name="status" defaultValue={status || ""}>
            <option value="">All statuses</option>
            {["submitted", "received", "verified", "compounding", "shipped", "delivered", "on_hold"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select name="escript" defaultValue={escript || ""}>
            <option value="">All eScripts</option>
            <option value="pending_signature">Pending signature</option>
            <option value="signed">Signed</option>
            <option value="not_required">Not required</option>
          </select>
          <select name="payment" defaultValue={payment || ""}>
            <option value="">All payments</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
          <button className="btn btn-accent" type="submit">
            Apply
          </button>
          {query || status || escript || payment ? (
            <Link className="btn btn-ghost" href="/portal/orders">
              Clear
            </Link>
          ) : null}
        </form>
      </SectionCard>

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
                  <th>eScript</th>
                  <th>Pharmacy / tracking</th>
                  <th>Lines</th>
                  <th>Total</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const trackUrl = trackingHref(order.trackingNumber);
                  return (
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
                      <td>
                        <StatusBadge tone={statusTone(order.escriptStatus || "n/a")}>
                          {order.escriptStatus || "n/a"}
                        </StatusBadge>
                      </td>
                      <td>
                        <div>{order.pharmacy?.name || "Unassigned"}</div>
                        {order.trackingNumber ? (
                          trackUrl ? (
                            <a href={trackUrl} target="_blank" rel="noreferrer" className="ws-text-link">
                              {order.trackingNumber}
                            </a>
                          ) : (
                            <span className="muted">{order.trackingNumber}</span>
                          )
                        ) : (
                          <span className="muted">{order.rxhereOrderId || order.rxcoreOrderId || "No tracking yet"}</span>
                        )}
                      </td>
                      <td>{order._count.lines}</td>
                      <td>{money(order.totalCents)}</td>
                      <td className="muted">{order.createdAt.toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No orders match"
            body="Adjust filters or place a catalog order."
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
