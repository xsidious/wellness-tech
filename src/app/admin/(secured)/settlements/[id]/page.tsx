import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, SectionCard, StatusBadge, statusTone } from "@/components/portal/Workspace";
import { closeSettlement } from "@/lib/admin-actions";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function AdminSettlementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const settlement = await prisma.settlement.findUnique({
    where: { id },
    include: {
      org: true,
      lines: { include: { order: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!settlement) notFound();

  return (
    <div className="ws-stack">
      <PageHeader
        kicker={settlement.kind}
        title={`Settlement ${settlement.periodStart.toLocaleDateString()} – ${settlement.periodEnd.toLocaleDateString()}`}
        lede={settlement.org?.legalName || "Network-wide batch"}
        actions={
          <div className="ws-head-actions">
            <Link className="btn btn-ghost" href="/admin/settlements">
              All settlements
            </Link>
            {settlement.status === "open" ? (
              <form action={closeSettlement}>
                <input type="hidden" name="id" value={settlement.id} />
                <button className="btn btn-accent" type="submit">
                  Close period
                </button>
              </form>
            ) : null}
          </div>
        }
      />

      <div className="ws-stat-grid">
        <div className="ws-stat ws-stat-accent">
          <span className="ws-stat-label">Total</span>
          <strong className="ws-stat-value">{money(settlement.totalCents)}</strong>
        </div>
        <div className="ws-stat">
          <span className="ws-stat-label">Lines</span>
          <strong className="ws-stat-value">{settlement.lines.length}</strong>
        </div>
        <div className="ws-stat">
          <span className="ws-stat-label">Status</span>
          <strong className="ws-stat-value" style={{ fontSize: "1.1rem" }}>
            <StatusBadge tone={statusTone(settlement.status)}>{settlement.status}</StatusBadge>
          </strong>
        </div>
      </div>

      <SectionCard title="Lines">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Order</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {settlement.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.label}</td>
                  <td>
                    {line.order ? (
                      <Link href={`/admin/orders/${line.order.id}`}>{line.order.invoiceNumber}</Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{money(line.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
