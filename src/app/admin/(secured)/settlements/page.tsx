import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { createSettlement } from "@/lib/admin-actions";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function AdminSettlementsPage() {
  const [settlements, practices] = await Promise.all([
    prisma.settlement.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { org: true, _count: { select: { lines: true } } },
    }),
    prisma.organization.findMany({
      where: { type: { not: "affiliate" } },
      orderBy: { legalName: "asc" },
      take: 200,
    }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Finance"
        title="Settlements"
        lede="Period close for practice invoices and pharmacy payables — VitaRelay-style settlement automation surface."
      />

      <SectionCard title="Open a settlement period">
        <form action={createSettlement} className="ws-message-form">
          <div className="ws-kv">
            <label>
              Kind
              <select name="kind" defaultValue="practice">
                <option value="practice">Practice invoices</option>
                <option value="pharmacy">Pharmacy payables</option>
                <option value="affiliate">Affiliate payouts</option>
              </select>
            </label>
            <label>
              Practice (optional)
              <select name="orgId" defaultValue="">
                <option value="">All practices</option>
                {practices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.legalName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Period start
              <input type="date" name="periodStart" defaultValue={monthAgo} required />
            </label>
            <label>
              Period end
              <input type="date" name="periodEnd" defaultValue={today} required />
            </label>
          </div>
          <label>
            Notes
            <input name="notes" placeholder="Month-end close" />
          </label>
          <button className="btn btn-accent" type="submit">
            Build settlement from paid orders
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Settlement runs">
        {settlements.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Kind</th>
                  <th>Practice</th>
                  <th>Lines</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/admin/settlements/${s.id}`}>
                        <b>
                          {s.periodStart.toLocaleDateString()} – {s.periodEnd.toLocaleDateString()}
                        </b>
                      </Link>
                    </td>
                    <td>{s.kind}</td>
                    <td>{s.org?.legalName || "Network-wide"}</td>
                    <td>{s._count.lines}</td>
                    <td>{money(s.totalCents)}</td>
                    <td>
                      <StatusBadge tone={statusTone(s.status)}>{s.status}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No settlements yet" body="Create a period to pull paid invoices into a close batch." />
        )}
      </SectionCard>
    </div>
  );
}
