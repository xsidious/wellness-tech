import Link from "next/link";
import { PageHeader, SectionCard, StatTile } from "@/components/portal/Workspace";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function AdminReportsPage() {
  const [orders, affiliates, commissions, pharmacies, practices] = await Promise.all([
    prisma.order.findMany({ include: { lines: true, org: true } }),
    prisma.affiliateProfile.count(),
    prisma.commission.findMany({ take: 500 }),
    prisma.pharmacy.count(),
    prisma.organization.count(),
  ]);

  const paid = orders.filter((o) => o.paymentStatus === "paid");
  const revenue = paid.reduce((s, o) => s + o.totalCents, 0);
  const open = orders.filter((o) => o.status !== "delivered").length;
  const delivered = orders.filter((o) => o.status === "delivered").length;
  const commissionTotal = commissions.reduce((s, c) => s + c.amountCents, 0);

  const byClass = new Map<string, number>();
  for (const order of orders) {
    for (const line of order.lines) {
      byClass.set(line.productClass || "Other", (byClass.get(line.productClass || "Other") || 0) + line.qty);
    }
  }

  const byPractice = new Map<string, number>();
  for (const order of paid) {
    byPractice.set(order.org.legalName, (byPractice.get(order.org.legalName) || 0) + order.totalCents);
  }

  const csvRows = [
    ["invoice", "practice", "status", "payment", "total_cents", "created"].join(","),
    ...orders.slice(0, 500).map((o) =>
      [o.invoiceNumber, JSON.stringify(o.org.legalName), o.status, o.paymentStatus, o.totalCents, o.createdAt.toISOString()].join(","),
    ),
  ].join("\n");

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Analytics"
        title="Reports"
        lede="Network spend, fulfillment volume, and affiliate payout visibility."
        actions={
          <a
            className="btn btn-ghost"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(csvRows)}`}
            download="wt-orders-export.csv"
          >
            Export orders CSV
          </a>
        }
      />

      <div className="ws-stat-grid">
        <StatTile label="Paid revenue" value={money(revenue)} tone="accent" />
        <StatTile label="Open orders" value={open} tone="warn" />
        <StatTile label="Delivered" value={delivered} tone="ok" />
        <StatTile label="Affiliate commissions" value={money(commissionTotal)} hint={`${affiliates} affiliates`} />
        <StatTile label="Practices" value={practices} />
        <StatTile label="Pharmacies" value={pharmacies} />
      </div>

      <div className="ws-split">
        <SectionCard title="Units by product class">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Units</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byClass.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([klass, qty]) => (
                    <tr key={klass}>
                      <td>{klass}</td>
                      <td>{qty}</td>
                    </tr>
                  ))}
                {!byClass.size ? (
                  <tr>
                    <td colSpan={2} className="muted">
                      No volume yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Top practices by paid volume">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Practice</th>
                  <th>Paid</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byPractice.entries())
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 12)
                  .map(([name, cents]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>{money(cents)}</td>
                    </tr>
                  ))}
                {!byPractice.size ? (
                  <tr>
                    <td colSpan={2} className="muted">
                      No paid volume yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginTop: 12 }}>
            Settlements live under <Link href="/admin/settlements">Finance → Settlements</Link>.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
