import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  QuickLink,
  SectionCard,
  StatTile,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { money } from "@/lib/money";
import { requireUser } from "@/lib/guard";
import { resolvePharmacyScope } from "@/lib/pharmacy-scope";
import { prisma } from "@/lib/prisma";

export default async function PharmacyOverviewPage() {
  const user = await requireUser();
  const scope = await resolvePharmacyScope(user);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const base = scope.orderWhere;
  const readyWhere = {
    ...base,
    escriptStatus: { in: ["signed", "not_required"] },
    status: { notIn: ["delivered", "on_hold"] },
  };

  const [queue, held, compounding, shippedToday, delivered30, pendingEscript, recent, scriptsAwaiting] =
    await Promise.all([
      prisma.order.findMany({
        where: readyWhere,
        orderBy: { createdAt: "asc" },
        take: 12,
        include: { org: true, clinicalPatient: true, lines: true, pharmacy: true },
      }),
      prisma.order.count({ where: { ...base, status: "on_hold" } }),
      prisma.order.count({ where: { ...base, status: "compounding" } }),
      prisma.order.count({ where: { ...base, status: "shipped", createdAt: { gte: todayStart } } }),
      prisma.order.count({ where: { ...base, status: "delivered", createdAt: { gte: since } } }),
      prisma.order.count({ where: { ...base, escriptStatus: "pending_signature" } }),
      prisma.order.findMany({
        where: base,
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { org: true, clinicalPatient: true },
      }),
      prisma.eScript.count({
        where: {
          status: "signed",
          order: base,
        },
      }),
    ]);

  const pharmacy = scope.pharmacy;

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Pharmacy workspace"
        title={pharmacy?.name || "Fulfillment overview"}
        lede={
          pharmacy
            ? `${pharmacy.type} · ${pharmacy.region || "Network"} · ${pharmacy.status} · ${pharmacy.sla || "SLA not set"}`
            : "Link a pharmacy record to this login to scope orders, locations, and staff."
        }
        actions={
          <div className="ws-head-actions">
            <Link className="btn btn-ghost" href="/pharmacy/profile">
              Pharmacy profile
            </Link>
            <Link className="btn btn-accent" href="/pharmacy/orders">
              All orders
            </Link>
          </div>
        }
      />

      <div className="ws-stat-grid">
        <StatTile label="Ready queue" value={queue.length} tone="accent" hint="Signed / not required" />
        <StatTile label="Compounding" value={compounding} />
        <StatTile label="On hold" value={held} tone="warn" />
        <StatTile label="Shipped (today/open)" value={shippedToday} tone="ok" />
        <StatTile label="Delivered (30d)" value={delivered30} />
        <StatTile label="Awaiting eScript" value={pendingEscript} tone="warn" hint={`${scriptsAwaiting} signed scripts on file`} />
      </div>

      {pharmacy ? (
        <div className="ws-split">
          <SectionCard title="Pharmacy card" description="What practices and admins see for this partner.">
            <div className="ws-kv">
              <div>
                <span>Contact</span>
                <strong>{pharmacy.contactEmail || "—"}</strong>
              </div>
              <div>
                <span>Locations</span>
                <strong>{pharmacy._count.locations}</strong>
              </div>
              <div>
                <span>Staff seats</span>
                <strong>{pharmacy._count.users}</strong>
              </div>
              <div>
                <span>Orders routed</span>
                <strong>{pharmacy._count.orders}</strong>
              </div>
            </div>
            {scope.specialties.length ? (
              <div className="ws-chip-row" style={{ marginTop: 14 }}>
                {scope.specialties.map((s) => (
                  <span key={s} className="ws-chip">
                    {s}
                  </span>
                ))}
              </div>
            ) : null}
            {pharmacy.description ? <p className="muted" style={{ marginTop: 12 }}>{pharmacy.description}</p> : null}
          </SectionCard>

          <SectionCard title="Operate">
            <div className="ws-quick-grid">
              <QuickLink href="/pharmacy/orders?status=submitted" title="New intake" body="Just arrived for verification" />
              <QuickLink href="/pharmacy/orders?status=compounding" title="Compounding" body="In production" />
              <QuickLink href="/pharmacy/orders?status=on_hold" title="Holds" body="Needs clarification / stock" />
              <QuickLink href="/pharmacy/scripts" title="eScripts" body="Signed Rx artifacts" />
              <QuickLink href="/pharmacy/locations" title="Locations" body="Dispensing sites" />
              <QuickLink href="/pharmacy/staff" title="Staff" body="Pharmacy seats" />
              <QuickLink href="/pharmacy/reports" title="Reports" body="Volume and SLA" />
              <QuickLink href="/pharmacy/profile" title="Profile" body="Capabilities & contact" />
            </div>
          </SectionCard>
        </div>
      ) : (
        <SectionCard title="No pharmacy linked">
          <p className="muted">
            Ask an admin to create the Pharmacy record and set <code>pharmacyId</code> on this user. Admins can still
            browse network queues from this workspace once a pharmacy exists.
          </p>
        </SectionCard>
      )}

      <SectionCard
        title="Ready to fulfill"
        description="eScript-cleared orders waiting for compounding or ship."
        action={
          <Link href="/pharmacy/orders" className="ws-text-link">
            View all
          </Link>
        }
      >
        {queue.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Practice</th>
                  <th>Patient</th>
                  <th>Ship to</th>
                  <th>Lines</th>
                  <th>eScript</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/pharmacy/orders/${order.id}`}>
                        <b>{order.invoiceNumber}</b>
                      </Link>
                    </td>
                    <td>{order.org.legalName}</td>
                    <td>
                      {order.clinicalPatient?.fullName ||
                        order.lines.find((l) => l.patientInitials)?.patientInitials ||
                        "—"}
                    </td>
                    <td>{order.shipDestination}</td>
                    <td>{order.lines.length}</td>
                    <td>
                      <StatusBadge tone={statusTone(order.escriptStatus)}>{order.escriptStatus}</StatusBadge>
                    </td>
                    <td>
                      <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
                    </td>
                    <td>{money(order.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Queue clear" body="New signed eScript orders land here for compounding and ship." />
        )}
      </SectionCard>

      <SectionCard title="Recent activity">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Practice</th>
                <th>Patient</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link href={`/pharmacy/orders/${order.id}`}>{order.invoiceNumber}</Link>
                  </td>
                  <td>{order.org.legalName}</td>
                  <td>{order.clinicalPatient?.fullName || "—"}</td>
                  <td>
                    <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
                  </td>
                  <td className="muted">{order.createdAt.toLocaleString()}</td>
                </tr>
              ))}
              {!recent.length ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No orders routed yet.
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
