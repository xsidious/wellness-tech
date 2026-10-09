import Link from "next/link";
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
      lines: { select: { id: true } },
    },
  });

  return (
    <>
      <div className="dash-head">
        <div>
          <p className="kicker">Fulfillment</p>
          <h1>Orders</h1>
          <p className="lede">Every portal and KIAN-forwarded invoice — open a row for the full clinical chart.</p>
        </div>
      </div>

      <form className="row" style={{ flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <input name="q" defaultValue={query} placeholder="Search invoice, patient, practice, RxHere id" style={{ minWidth: 280 }} />
        <select name="status" defaultValue={status || ""}>
          <option value="">All statuses</option>
          {["submitted", "received", "verified", "compounding", "shipped", "delivered", "on_hold"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="btn btn-accent" type="submit">
          Filter
        </button>
      </form>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Practice</th>
              <th>Patient</th>
              <th>Lines</th>
              <th>Payment</th>
              <th>Status</th>
              <th>RxHere</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>
                  <Link href={`/admin/orders/${order.id}`}>{order.invoiceNumber}</Link>
                  {order.partnerExternalRef ? <div className="muted">{order.partnerExternalRef}</div> : null}
                </td>
                <td>
                  <Link href={`/admin/practices/${order.orgId}`}>{order.org.legalName}</Link>
                </td>
                <td>
                  {order.clinicalPatient ? (
                    <Link href={`/admin/patients/${order.clinicalPatient.id}`}>{order.clinicalPatient.fullName}</Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{order.lines.length}</td>
                <td>{order.paymentStatus}</td>
                <td>{order.status}</td>
                <td>{order.rxhereOrderId || "—"}</td>
                <td>{money(order.totalCents)}</td>
              </tr>
            ))}
            {!orders.length ? (
              <tr>
                <td colSpan={8}>No orders match.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
