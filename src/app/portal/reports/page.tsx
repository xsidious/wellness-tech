import Link from "next/link";
import { PageHeader, SectionCard, StatTile } from "@/components/portal/Workspace";
import { requireUser } from "@/lib/guard";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function ReportsPage() {
  const user = await requireUser();
  const [orders, patients, refillsDue, products] = await Promise.all([
    prisma.order.findMany({ where: { orgId: user.orgId }, include: { lines: true } }),
    prisma.clinicalPatient.count({ where: { orgId: user.orgId } }),
    prisma.refill.count({ where: { orgId: user.orgId, status: "due" } }),
    prisma.product.count({ where: { active: true } }),
  ]);

  const spend = orders.reduce((sum, order) => sum + order.totalCents, 0);
  const lines = orders.reduce((sum, order) => sum + order.lines.length, 0);
  const delivered = orders.filter((o) => o.status === "delivered").length;
  const byClass = new Map<string, number>();
  for (const order of orders) {
    for (const line of order.lines) {
      byClass.set(line.productClass || "Other", (byClass.get(line.productClass || "Other") || 0) + line.qty);
    }
  }

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Analytics"
        title="Reports"
        lede="Practice-level volume and spend. Internal wholesale margin stays out of this view."
        actions={
          <Link className="btn btn-ghost" href="/portal/orders">
            Export via orders
          </Link>
        }
      />

      <div className="ws-stat-grid">
        <StatTile label="Orders" value={orders.length} tone="accent" />
        <StatTile label="Spend" value={money(spend)} />
        <StatTile label="Line items" value={lines} />
        <StatTile label="Delivered" value={delivered} tone="ok" />
        <StatTile label="Patients" value={patients} />
        <StatTile label="Refills due" value={refillsDue} tone={refillsDue ? "warn" : "default"} />
        <StatTile label="Active SKUs" value={products} />
      </div>

      <SectionCard title="Volume by product class" description="Units ordered across all invoices.">
        {byClass.size ? (
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
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No line volume yet.</p>
        )}
      </SectionCard>
    </div>
  );
}
