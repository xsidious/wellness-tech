import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { runAffiliatePayout } from "@/lib/affiliate-actions";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function AdminAffiliatesPage() {
  const affiliates = await prisma.affiliateProfile.findMany({
    include: {
      user: { include: { org: true } },
      children: { include: { user: true } },
      parent: true,
    },
    orderBy: { code: "asc" },
  });
  const commissions = await prisma.commission.findMany({
    orderBy: { createdAt: "desc" },
    take: 40,
    include: { order: true },
  });
  const pendingCents = commissions.filter((c) => c.status === "pending_batch").reduce((s, c) => s + c.amountCents, 0);

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Growth"
        title="Affiliates"
        lede="Codes, referred orgs, downlines, and commission ledger — payout runs feed Settlements."
        actions={
          <form action={runAffiliatePayout}>
            <button className="btn btn-accent" type="submit">
              Run payout → Settlements ({money(pendingCents)})
            </button>
          </form>
        }
      />

      <SectionCard title="Affiliate partners">
        {affiliates.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Partner link</th>
                  <th>Parent</th>
                  <th>Downline</th>
                  <th>W-9</th>
                  <th>Plan</th>
                </tr>
              </thead>
              <tbody>
                {affiliates.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <b>{row.code}</b>
                    </td>
                    <td>
                      {row.user.name}
                      <div className="muted">{row.user.email}</div>
                      <div className="muted">
                        <Link href={`/admin/practices/${row.user.orgId}`}>{row.user.org.legalName}</Link>
                      </div>
                    </td>
                    <td className="muted" style={{ maxWidth: 220, wordBreak: "break-all" }}>
                      {row.partnerLink || `/?ref=${row.code}`}
                    </td>
                    <td>{row.parent?.code || "—"}</td>
                    <td>{row.children.map((c) => c.code).join(", ") || "—"}</td>
                    <td>
                      <StatusBadge tone={statusTone(row.w9Status)}>{row.w9Status}</StatusBadge>
                    </td>
                    <td>{row.commissionPlan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No affiliates yet" body="Affiliate signups appear here with permanent partner links." />
        )}
      </SectionCard>

      <SectionCard title="Recent commissions">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Eligible</th>
                <th>Rate</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {commissions.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/admin/orders/${row.orderId}`}>{row.order.invoiceNumber}</Link>
                  </td>
                  <td>{money(row.eligibleCents)}</td>
                  <td>{(row.rateBps / 100).toFixed(1)}%</td>
                  <td>{money(row.amountCents)}</td>
                  <td>
                    <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge>
                  </td>
                </tr>
              ))}
              {!commissions.length ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No commissions yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
