import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatTile,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { ensureAffiliatePartnerLink, updateAffiliateW9 } from "@/lib/affiliate-actions";
import { requireUser } from "@/lib/guard";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function AffiliatePortal({
  searchParams,
}: {
  searchParams: Promise<{ w9?: string }>;
}) {
  const user = await requireUser();
  const notices = await searchParams;
  if (!user.affiliate) {
    return (
      <div className="ws-stack">
        <PageHeader kicker="Partner" title="Affiliate portal" lede="This account is not an affiliate." />
        <p>
          <Link href="/signup?type=affiliate">Open an affiliate signup</Link>.
        </p>
      </div>
    );
  }

  const partnerLink = (await ensureAffiliatePartnerLink()) || user.affiliate.partnerLink;
  const [accounts, commissions, downline, referredOrders, settlements] = await Promise.all([
    prisma.organization.findMany({ where: { referringAffiliateId: user.id } }),
    prisma.commission.findMany({
      where: { affiliateUserId: user.id },
      include: { order: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.affiliateProfile.findMany({
      where: { parentId: user.affiliate.id },
      include: { user: true },
    }),
    prisma.order.findMany({
      where: { org: { referringAffiliateId: user.id } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { org: true },
    }),
    prisma.settlement.findMany({
      where: {
        kind: "affiliate",
        OR: [{ notes: { contains: user.id } }, { notes: { contains: user.affiliate.code } }],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { _count: { select: { lines: true } } },
    }),
  ]);

  const total = commissions.reduce((sum, row) => sum + row.amountCents, 0);
  const pending = commissions.filter((c) => c.status === "pending_batch").reduce((s, c) => s + c.amountCents, 0);
  const paid = commissions.filter((c) => c.status === "paid").reduce((s, c) => s + c.amountCents, 0);

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Vita Rep"
        title="Affiliate network"
        lede="Permanent partner link, attributed practices, one-level downline, commission ledger, and W-9 status."
      />
      {notices.w9 ? <p className="note">W-9 status updated.</p> : null}

      <div className="ws-stat-grid">
        <StatTile label="Lifetime" value={money(total)} tone="accent" />
        <StatTile label="Pending payout" value={money(pending)} tone="warn" />
        <StatTile label="Paid out" value={money(paid)} tone="ok" />
        <StatTile label="Referred practices" value={accounts.length} />
        <StatTile label="Downline" value={downline.length} />
      </div>

      <SectionCard title="Partner link" description="Attribution sticks on the practice organization forever.">
        <div className="ws-kv">
          <div>
            <span>Code</span>
            <strong>{user.affiliate.code}</strong>
          </div>
          <div>
            <span>Link</span>
            <strong style={{ wordBreak: "break-all" }}>{partnerLink}</strong>
          </div>
          <div>
            <span>W-9</span>
            <StatusBadge tone={statusTone(user.affiliate.w9Status)}>{user.affiliate.w9Status}</StatusBadge>
          </div>
          <div>
            <span>Plan</span>
            <strong>{user.affiliate.commissionPlan}</strong>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="W-9 / tax status"
        description="Mark when you have submitted a W-9 to Wellness Tech. Verified status is set by operations."
      >
        <form action={updateAffiliateW9} className="ws-message-form" style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <select name="w9Status" defaultValue={user.affiliate.w9Status}>
            <option value="sandbox_received">Sandbox / not submitted</option>
            <option value="submitted">Submitted to Wellness Tech</option>
            {user.affiliate.w9Status === "verified" ? (
              <option value="verified">Verified</option>
            ) : null}
            <option value="rejected">Needs correction</option>
          </select>
          <button className="btn btn-accent" type="submit">
            Update W-9 status
          </button>
        </form>
        <p className="muted" style={{ marginTop: 10 }}>
          Email your completed W-9 to your Wellness Tech rep. This control records submission status for payout readiness.
        </p>
      </SectionCard>

      <div className="ws-split">
        <SectionCard title="Referred practices">
          {accounts.length ? (
            <ul>
              {accounts.map((account) => (
                <li key={account.id}>
                  {account.legalName} · {account.status}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No referrals yet" body="Share your partner link to attribute new practice signups." />
          )}
        </SectionCard>

        <SectionCard title="One-level downline">
          {downline.length ? (
            <ul>
              {downline.map((child) => (
                <li key={child.id}>
                  {child.user.name} · {child.code}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Affiliates who join with your code appear here (one level).</p>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Payout history" description="Paid commissions and settlement batches tied to your affiliate account.">
        <div className="ws-stat-grid" style={{ marginBottom: 14 }}>
          <StatTile label="Paid commissions" value={money(paid)} tone="ok" />
          <StatTile label="Settlement runs" value={settlements.length} />
        </div>
        {settlements.length ? (
          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Lines</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.periodStart.toLocaleDateString()} – {s.periodEnd.toLocaleDateString()}
                    </td>
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
        ) : null}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Amount</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {commissions
                .filter((c) => c.status === "paid")
                .slice(0, 40)
                .map((row) => (
                  <tr key={row.id}>
                    <td>{row.order.invoiceNumber}</td>
                    <td>{money(row.amountCents)}</td>
                    <td>
                      <StatusBadge tone="ok">paid</StatusBadge>
                    </td>
                    <td className="muted">{row.createdAt.toLocaleDateString()}</td>
                  </tr>
                ))}
              {!commissions.some((c) => c.status === "paid") ? (
                <tr>
                  <td colSpan={4} className="muted">
                    Paid commissions appear here after Wellness Tech runs an affiliate payout.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Attributed orders">
        {referredOrders.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Practice</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {referredOrders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.invoiceNumber}</td>
                    <td>{o.org.legalName}</td>
                    <td>{o.status}</td>
                    <td>{money(o.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Orders from referred practices show here for visibility.</p>
        )}
      </SectionCard>

      <SectionCard title={`Commission ledger · ${money(total)}`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Eligible</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {commissions.map((row) => (
                <tr key={row.id}>
                  <td>{row.order.invoiceNumber}</td>
                  <td>{money(row.eligibleCents)}</td>
                  <td>{money(row.amountCents)}</td>
                  <td>
                    <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge>
                  </td>
                </tr>
              ))}
              {!commissions.length ? (
                <tr>
                  <td colSpan={4} className="muted">
                    Device and supply lines post commission on delivery.
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
