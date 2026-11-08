import { PageHeader, SectionCard, StatTile } from "@/components/portal/Workspace";
import { money } from "@/lib/money";
import { requireUser } from "@/lib/guard";
import { resolvePharmacyScope } from "@/lib/pharmacy-scope";
import { prisma } from "@/lib/prisma";

export default async function PharmacyReportsPage() {
  const user = await requireUser();
  const scope = await resolvePharmacyScope(user);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const base = scope.orderWhere;

  const [total30, shipped30, delivered30, holds30, revenue30, byStatus, topSkus] = await Promise.all([
    prisma.order.count({ where: { ...base, createdAt: { gte: since } } }),
    prisma.order.count({ where: { ...base, status: "shipped", createdAt: { gte: since } } }),
    prisma.order.count({ where: { ...base, status: "delivered", createdAt: { gte: since } } }),
    prisma.order.count({ where: { ...base, status: "on_hold", createdAt: { gte: since } } }),
    prisma.order.aggregate({
      where: { ...base, createdAt: { gte: since } },
      _sum: { totalCents: true },
    }),
    prisma.order.groupBy({
      by: ["status"],
      where: { ...base, createdAt: { gte: since } },
      _count: true,
      orderBy: { _count: { status: "desc" } },
    }),
    prisma.orderLine.groupBy({
      by: ["sku", "name"],
      where: { order: { ...base, createdAt: { gte: since } } },
      _sum: { qty: true },
      orderBy: { _sum: { qty: "desc" } },
      take: 12,
    }),
  ]);

  const fillRate = total30 ? Math.round(((shipped30 + delivered30) / total30) * 100) : 0;

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Pharmacy"
        title="Fulfillment reports"
        lede={
          scope.pharmacy
            ? `Last 30 days for ${scope.pharmacy.name}.`
            : "Last 30 days across the visible order book."
        }
      />

      <div className="ws-stat-grid">
        <StatTile label="Orders (30d)" value={total30} tone="accent" />
        <StatTile label="Shipped" value={shipped30} tone="ok" />
        <StatTile label="Delivered" value={delivered30} />
        <StatTile label="Holds" value={holds30} tone="warn" />
        <StatTile label="Fill rate" value={`${fillRate}%`} hint="Shipped + delivered / total" />
        <StatTile label="Routed volume" value={money(revenue30._sum.totalCents || 0)} />
      </div>

      <div className="ws-split">
        <SectionCard title="Status mix">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {byStatus.map((row) => (
                  <tr key={row.status}>
                    <td>{row.status}</td>
                    <td>{row._count}</td>
                  </tr>
                ))}
                {!byStatus.length ? (
                  <tr>
                    <td colSpan={2} className="muted">
                      No data yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Top compounds (qty)">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>Qty</th>
                </tr>
              </thead>
              <tbody>
                {topSkus.map((row) => (
                  <tr key={row.sku}>
                    <td className="muted">{row.sku}</td>
                    <td>{row.name}</td>
                    <td>{row._sum.qty || 0}</td>
                  </tr>
                ))}
                {!topSkus.length ? (
                  <tr>
                    <td colSpan={3} className="muted">
                      No lines yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
