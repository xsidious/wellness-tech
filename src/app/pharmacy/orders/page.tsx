import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { money } from "@/lib/money";
import { requireUser } from "@/lib/guard";
import { resolvePharmacyScope } from "@/lib/pharmacy-scope";
import { prisma } from "@/lib/prisma";

const STATUSES = ["submitted", "received", "verified", "compounding", "shipped", "delivered", "on_hold"];

export default async function PharmacyOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; escript?: string }>;
}) {
  const user = await requireUser();
  const scope = await resolvePharmacyScope(user);
  const { q, status, escript } = await searchParams;
  const query = (q || "").trim();

  const orders = await prisma.order.findMany({
    where: {
      ...scope.orderWhere,
      ...(status ? { status } : {}),
      ...(escript ? { escriptStatus: escript } : {}),
      ...(query
        ? {
            OR: [
              { invoiceNumber: { contains: query, mode: "insensitive" } },
              { trackingNumber: { contains: query, mode: "insensitive" } },
              { partnerExternalRef: { contains: query, mode: "insensitive" } },
              { clinicalPatient: { fullName: { contains: query, mode: "insensitive" } } },
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
      lines: { select: { id: true, name: true } },
      escripts: { select: { id: true, status: true }, take: 1, orderBy: { createdAt: "desc" } },
    },
  });

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Fulfillment"
        title="Pharmacy orders"
        lede={
          scope.pharmacy
            ? `Full order book for ${scope.pharmacy.name} — filter by status, eScript, patient, or tracking.`
            : "Network order book."
        }
      />

      <SectionCard title="Filter">
        <form className="ws-message-form" style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <input name="q" defaultValue={query} placeholder="Invoice, patient, practice, tracking…" style={{ minWidth: 260, flex: 1 }} />
          <select name="status" defaultValue={status || ""}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select name="escript" defaultValue={escript || ""}>
            <option value="">All eScript</option>
            <option value="signed">signed</option>
            <option value="pending_signature">pending_signature</option>
            <option value="not_required">not_required</option>
          </select>
          <button className="btn btn-accent" type="submit">
            Apply
          </button>
        </form>
      </SectionCard>

      <SectionCard title={`${orders.length} orders`} flush>
        {orders.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Practice</th>
                  <th>Patient</th>
                  <th>Ship to</th>
                  <th>Products</th>
                  <th>eScript</th>
                  <th>Tracking</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/pharmacy/orders/${order.id}`}>
                        <b>{order.invoiceNumber}</b>
                      </Link>
                      <div className="muted">{order.createdAt.toLocaleDateString()}</div>
                    </td>
                    <td>{order.org.legalName}</td>
                    <td>{order.clinicalPatient?.fullName || "—"}</td>
                    <td>{order.shipDestination}</td>
                    <td className="muted">
                      {order.lines
                        .slice(0, 2)
                        .map((l) => l.name)
                        .join(" · ") || "—"}
                      {order.lines.length > 2 ? ` +${order.lines.length - 2}` : ""}
                    </td>
                    <td>
                      <StatusBadge tone={statusTone(order.escriptStatus)}>{order.escriptStatus}</StatusBadge>
                    </td>
                    <td className="muted">{order.trackingNumber || "—"}</td>
                    <td>
                      <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
                    </td>
                    <td>{money(order.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No matching orders" body="Widen filters or wait for the next routed invoice." />
        )}
      </SectionCard>
    </div>
  );
}
