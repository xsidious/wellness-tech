import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatTile,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { ensureAffiliatePartnerLink } from "@/lib/affiliate-actions";
import { requireUser } from "@/lib/guard";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function AffiliatePortal() {
  const user = await requireUser();
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
  const [accounts, commissions, downline, referredOrders] = await Promise.all([
    prisma.organization.findMany({ where: { referringAffiliateId: user.id } }),
    prisma.commission.findMany({ where: { affiliateUserId: user.id }, include: { order: true }, orderBy: { createdAt: "desc" } }),
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
  ]);

  const total = commissions.reduce((sum, row) => sum + row.amountCents, 0);
  const pending = commissions.filter((c) => c.status === "pending_batch").reduce((s, c) => s + c.amountCents, 0);

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Vita Rep"
        title="Affiliate network"
        lede="Permanent partner link, attributed practices, one-level downline, and commission ledger."
      />

      <div className="ws-stat-grid">
        <StatTile label="Lifetime" value={money(total)} tone="accent" />
        <StatTile label="Pending payout" value={money(pending)} tone="warn" />
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

      <SectionCard title={`Commissions · ${money(total)}`}>
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
