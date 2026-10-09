import Link from "next/link";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function AdminAffiliatesPage() {
  const affiliates = await prisma.affiliateProfile.findMany({
    include: {
      user: { include: { org: true } },
    },
    orderBy: { code: "asc" },
  });
  const commissions = await prisma.commission.findMany({
    orderBy: { createdAt: "desc" },
    take: 40,
    include: { order: true },
  });

  return (
    <>
      <div className="dash-head">
        <div>
          <p className="kicker">Growth</p>
          <h1>Affiliates</h1>
          <p className="lede">Referral partners, codes, and commission ledger.</p>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Email</th>
              <th>Org</th>
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
                <td>{row.user.name}</td>
                <td>{row.user.email}</td>
                <td>
                  <Link href={`/admin/practices/${row.user.orgId}`}>{row.user.org.legalName}</Link>
                </td>
                <td>{row.w9Status}</td>
                <td>{row.commissionPlan}</td>
              </tr>
            ))}
            {!affiliates.length ? (
              <tr>
                <td colSpan={6}>No affiliates yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <section className="panel" style={{ marginTop: 24 }}>
        <h2>Recent commissions</h2>
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
                  <td>{row.status}</td>
                </tr>
              ))}
              {!commissions.length ? (
                <tr>
                  <td colSpan={5}>No commission rows yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
