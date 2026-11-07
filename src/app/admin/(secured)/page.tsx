import Link from "next/link";
import {
  PageHeader,
  QuickLink,
  SectionCard,
  StatTile,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { formatPrescriberLabel, resolveOrderPrescriber } from "@/lib/admin-clinical";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function AdminHome() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [
    practices,
    openOrders,
    paidAgg,
    affiliates,
    pharmacies,
    commissionsAgg,
    recentOrders,
    dueRefills,
    patients,
    prescribers,
    escripts,
    pendingEscripts,
  ] = await Promise.all([
    prisma.organization.count({ where: { status: "active" } }),
    prisma.order.count({ where: { status: { not: "delivered" } } }),
    prisma.order.aggregate({
      where: { paymentStatus: "paid", createdAt: { gte: since } },
      _sum: { totalCents: true },
      _count: true,
    }),
    prisma.affiliateProfile.count(),
    prisma.pharmacy.count().catch(() => 0),
    prisma.commission.aggregate({ _sum: { amountCents: true }, where: { status: "pending_batch" } }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        org: true,
        clinicalPatient: true,
        pharmacy: true,
        placedBy: true,
        lines: true,
        escripts: { include: { signedBy: true }, take: 1, orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.refill.count({ where: { status: "due" } }),
    prisma.clinicalPatient.count(),
    prisma.user.count({
      where: { OR: [{ roles: { contains: "prescriber" } }, { roles: { contains: "owner" } }, { credential: { isNot: null } }] },
    }),
    prisma.eScript.count().catch(() => 0),
    prisma.eScript.count({ where: { status: { in: ["draft", "pending"] } } }).catch(() => 0),
  ]);

  const dayBuckets = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (13 - i));
    return d;
  });
  const recentVolume = await prisma.order.findMany({
    where: { createdAt: { gte: dayBuckets[0] } },
    select: { createdAt: true, totalCents: true },
  });
  const volumeByDay = dayBuckets.map((day) => {
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const rows = recentVolume.filter((o) => o.createdAt >= day && o.createdAt < next);
    return { label: day.toLocaleDateString(undefined, { month: "short", day: "numeric" }), count: rows.length };
  });
  const maxVol = Math.max(1, ...volumeByDay.map((d) => d.count));

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Operator control plane"
        title="Operations dashboard"
        lede="Practices, clinicians, patients, prescriptions, pharmacies, and settlements — full-width workspace for the whole network."
        actions={
          <div className="ws-head-actions">
            <Link className="btn btn-ghost" href="/admin/prescriptions">
              Prescriptions
            </Link>
            <Link className="btn btn-ghost" href="/admin/settlements">
              Settlements
            </Link>
            <Link className="btn btn-accent" href="/admin/orders">
              Open orders
            </Link>
          </div>
        }
      />

      <div className="ws-stat-grid">
        <StatTile label="Open orders" value={openOrders} tone="accent" hint="Awaiting fulfillment" />
        <StatTile label="Patients" value={patients} hint={`${prescribers} clinicians`} />
        <StatTile label="eScripts" value={escripts} tone="ok" hint={`${pendingEscripts} awaiting signature`} />
        <StatTile
          label="Revenue (30d)"
          value={money(paidAgg._sum.totalCents || 0)}
          hint={`${paidAgg._count} paid invoices`}
        />
        <StatTile label="Active practices" value={practices} />
        <StatTile
          label="Commissions due"
          value={money(commissionsAgg._sum.amountCents || 0)}
          tone="warn"
          hint={`${affiliates} affiliates · ${pharmacies} pharmacies`}
        />
      </div>

      <div className="ws-split">
        <SectionCard title="Order volume" description="Last 14 days">
          <div className="ws-bars" aria-hidden>
            {volumeByDay.map((d) => (
              <div key={d.label} className="ws-bar-col" title={`${d.label}: ${d.count}`}>
                <div className="ws-bar" style={{ height: `${Math.max(8, (d.count / maxVol) * 100)}%` }} />
                <span>{d.label.split(" ")[1] || d.label}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Operate the network">
          <div className="ws-quick-grid">
            <QuickLink href="/admin/patients" title="Patients" body="Who brought whom · charts" />
            <QuickLink href="/admin/prescribers" title="Prescribers" body="NPI · patients · Rx" />
            <QuickLink href="/admin/prescriptions" title="Prescriptions" body="eScripts and Rx orders" />
            <QuickLink href="/admin/practices" title="Practices" body="Onboarding, tiers, locations" />
            <QuickLink href="/admin/pharmacies" title="Pharmacies" body="503A / 503B partners" />
            <QuickLink href="/pharmacy" title="Pharmacy queue" body="Fulfillment workspace" />
            <QuickLink href="/admin/affiliates" title="Affiliates" body="Rep codes and attribution" />
            <QuickLink href="/admin/settlements" title="Settlements" body="Period close and payables" />
            <QuickLink href="/admin/reports" title="Reports" body="Spend, SLA, payouts" />
            <QuickLink href="/admin/refills" title="Refills" body={`${dueRefills} due now`} />
            <QuickLink href="/admin/products" title="Catalog" body="Formulary sync" />
            <QuickLink href="/admin/audit" title="Audit log" body="Access and changes" />
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Recent orders"
        description="Prescriber → patient → prescription visibility on every invoice."
        action={
          <Link href="/admin/orders" className="ws-text-link">
            View all
          </Link>
        }
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Patient</th>
                <th>Prescriber</th>
                <th>Practice</th>
                <th>Status</th>
                <th>eScript</th>
                <th>Pharmacy</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => {
                const rx = resolveOrderPrescriber(order);
                return (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/admin/orders/${order.id}`}>
                        <b>{order.invoiceNumber}</b>
                      </Link>
                    </td>
                    <td>
                      {order.clinicalPatient ? (
                        <Link href={`/admin/patients/${order.clinicalPatient.id}`}>{order.clinicalPatient.fullName}</Link>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <b>{formatPrescriberLabel(rx)}</b>
                    </td>
                    <td>{order.org.legalName}</td>
                    <td>
                      <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
                    </td>
                    <td>
                      <StatusBadge tone={statusTone(order.escriptStatus || "not_required")}>
                        {order.escriptStatus || "n/a"}
                      </StatusBadge>
                    </td>
                    <td className="muted">{order.pharmacy?.name || order.rxhereOrderId || "—"}</td>
                    <td>{money(order.totalCents)}</td>
                  </tr>
                );
              })}
              {!recentOrders.length ? (
                <tr>
                  <td colSpan={8} className="muted">
                    No orders yet.
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
