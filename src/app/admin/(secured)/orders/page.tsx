import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { formatPrescriberLabel, resolveOrderPrescriber } from "@/lib/admin-clinical";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const query = (q || "").trim();
  const orders = await prisma.order.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(query
        ? {
            OR: [
              { invoiceNumber: { contains: query, mode: "insensitive" } },
              { partnerExternalRef: { contains: query, mode: "insensitive" } },
              { rxhereOrderId: { contains: query, mode: "insensitive" } },
              { trackingNumber: { contains: query, mode: "insensitive" } },
              { clinicalPatient: { fullName: { contains: query, mode: "insensitive" } } },
              { clinicalPatient: { email: { contains: query, mode: "insensitive" } } },
              { org: { legalName: { contains: query, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 150,
    include: {
      org: true,
      clinicalPatient: true,
      pharmacy: true,
      placedBy: true,
      lines: true,
      escripts: { include: { signedBy: true }, take: 1, orderBy: { createdAt: "desc" } },
    },
  });

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Fulfillment"
        title="Orders"
        lede="Payment, eScript, pharmacy routing, and tracking — exceptions surface here for retry."
      />

      <SectionCard title="Filter">
        <form className="ws-message-form" style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <input name="q" defaultValue={query} placeholder="Invoice, patient, practice, tracking…" style={{ minWidth: 280 }} />
          <select name="status" defaultValue={status || ""}>
            <option value="">All statuses</option>
            {["submitted", "received", "verified", "compounding", "shipped", "delivered", "on_hold"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button className="btn btn-accent" type="submit">
            Apply
          </button>
        </form>
      </SectionCard>

      <SectionCard title={`${orders.length} orders`}>
        {orders.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Patient</th>
                  <th>Prescriber</th>
                  <th>Practice</th>
                  <th>Ship to</th>
                  <th>Payment</th>
                  <th>eScript</th>
                  <th>Pharmacy</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const escript = order.escripts[0]?.status || order.escriptStatus;
                  const rx = resolveOrderPrescriber(order);
                  return (
                    <tr key={order.id}>
                      <td>
                        <Link href={`/admin/orders/${order.id}`}>
                          <b>{order.invoiceNumber}</b>
                        </Link>
                        {order.partnerExternalRef ? <div className="muted">{order.partnerExternalRef}</div> : null}
                        <div className="muted">{order.lines.length} lines</div>
                      </td>
                      <td>
                        {order.clinicalPatient ? (
                          <Link href={`/admin/patients/${order.clinicalPatient.id}`}>
                            <b>{order.clinicalPatient.fullName}</b>
                          </Link>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <b>{formatPrescriberLabel(rx)}</b>
                        <div className="muted">{rx.source === "none" ? "" : rx.source.replace("_", " ")}</div>
                      </td>
                      <td>
                        <Link href={`/admin/practices/${order.orgId}`}>{order.org.legalName}</Link>
                      </td>
                      <td>{order.shipDestination || "PRACTICE"}</td>
                      <td>
                        <StatusBadge tone={statusTone(order.paymentStatus)}>{order.paymentStatus}</StatusBadge>
                      </td>
                      <td>
                        <StatusBadge tone={statusTone(escript)}>{escript}</StatusBadge>
                      </td>
                      <td>
                        {order.pharmacy?.name || order.rxhereOrderId || "—"}
                        {order.trackingNumber ? <div className="muted">{order.trackingNumber}</div> : null}
                      </td>
                      <td>
                        <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
                      </td>
                      <td>{money(order.totalCents)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No orders match" body="Widen filters or wait for the next portal / KIAN submit." />
        )}
      </SectionCard>
    </div>
  );
}
