import Link from "next/link";
import { AttentionStrip, type AttentionItem } from "@/components/portal/AttentionStrip";
import {
  EmptyState,
  PageHeader,
  QuickLink,
  SectionCard,
  StatTile,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { requireUser, rolesOf } from "@/lib/guard";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { tierLabel } from "@/lib/rules";

export default async function PortalHome() {
  const user = await requireUser();
  const roles = rolesOf(user.roles);

  if (roles.includes("affiliate") && !roles.includes("owner") && !roles.includes("prescriber")) {
    return (
      <div className="ws-stack">
        <PageHeader
          kicker="Affiliate"
          title={`Welcome back, ${user.name}`}
          lede={`Code ${user.affiliate?.code || "—"}. Commission posts when a referred practice’s device or supply order is delivered.`}
          actions={
            <Link className="btn btn-accent" href="/portal/affiliate">
              View statements
            </Link>
          }
        />
        <SectionCard title="Partner workspace" description="Track referrals and education materials from one place.">
          <div className="ws-quick-grid">
            <QuickLink href="/portal/affiliate" title="Commissions" body="Payouts and referred practice activity" />
            <QuickLink href="/portal/education" title="Materials" body="Shareable decks and product education" />
          </div>
        </SectionCard>
      </div>
    );
  }

  const [
    openOrders,
    dueRefills,
    openRefillRequests,
    pendingEscripts,
    unpaidInvoices,
    unreadPatientMessages,
    cart,
    patients,
    recent,
    spendAgg,
  ] = await Promise.all([
    prisma.order.count({ where: { orgId: user.orgId, status: { not: "delivered" } } }),
    prisma.refill.count({ where: { orgId: user.orgId, status: "due" } }),
    prisma.refillRequest.count({
      where: { status: "requested", clinicalPatient: { orgId: user.orgId } },
    }),
    prisma.order.count({ where: { orgId: user.orgId, escriptStatus: "pending_signature" } }),
    prisma.order.count({
      where: { orgId: user.orgId, paymentStatus: { in: ["unpaid", "pending", "failed"] } },
    }),
    prisma.message.count({
      where: {
        orgId: user.orgId,
        channel: "patient",
        readAt: null,
        NOT: { authorUserId: user.id },
      },
    }),
    prisma.cartItem.count({ where: { userId: user.id } }),
    prisma.clinicalPatient.count({ where: { orgId: user.orgId } }),
    prisma.order.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { _count: { select: { lines: true } } },
    }),
    prisma.order.aggregate({ where: { orgId: user.orgId }, _sum: { totalCents: true }, _count: true }),
  ]);

  const attention: AttentionItem[] = [];
  if (!user.org.onboardingComplete) {
    attention.push({ href: "/portal/settings", label: "Finish practice onboarding", tone: "warn" });
  }
  if (openRefillRequests) {
    attention.push({
      href: "/portal/refills",
      label: `${openRefillRequests} patient refill request${openRefillRequests === 1 ? "" : "s"}`,
      tone: "warn",
    });
  }
  if (dueRefills) {
    attention.push({
      href: "/portal/refills",
      label: `${dueRefills} scheduled refill${dueRefills === 1 ? "" : "s"} due`,
      tone: "warn",
    });
  }
  if (pendingEscripts) {
    attention.push({
      href: "/portal/script-requests",
      label: `${pendingEscripts} eScript${pendingEscripts === 1 ? "" : "s"} awaiting signature`,
      tone: "warn",
    });
  }
  if (unpaidInvoices) {
    attention.push({
      href: "/portal/invoices?payment=unpaid",
      label: `${unpaidInvoices} unpaid invoice${unpaidInvoices === 1 ? "" : "s"}`,
      tone: "info",
    });
  }
  if (unreadPatientMessages) {
    attention.push({
      href: "/portal/messages",
      label: `${unreadPatientMessages} unread patient message${unreadPatientMessages === 1 ? "" : "s"}`,
      tone: "info",
    });
  }

  return (
    <div className="ws-stack">
      <PageHeader
        kicker={tierLabel(user.org.verificationTier)}
        title={user.org.legalName}
        lede="One workspace for patients, practitioners, pharmacy fulfillment, price lists, and practice ordering — the same operational spine as KIAN, built for distribution."
        actions={
          <div className="ws-head-actions">
            <Link className="btn btn-ghost" href="/portal/cart">
              Cart ({cart})
            </Link>
            <Link className="btn btn-accent" href="/portal/catalog">
              Browse catalog
            </Link>
          </div>
        }
      />

      <AttentionStrip items={attention} />

      <div className="ws-stat-grid">
        <StatTile label="Open orders" value={openOrders} hint="Awaiting fulfillment" tone="accent" />
        <StatTile label="Refills due" value={dueRefills} hint="Needs approval" tone={dueRefills ? "warn" : "ok"} />
        <StatTile
          label="Patient requests"
          value={openRefillRequests}
          hint="Portal refill inbox"
          tone={openRefillRequests ? "warn" : "ok"}
        />
        <StatTile label="Patients" value={patients} hint="Clinical charts on file" />
        <StatTile
          label="Lifetime spend"
          value={money(spendAgg._sum.totalCents || 0)}
          hint={`${spendAgg._count} invoices`}
        />
      </div>

      <div className="ws-split">
        <SectionCard
          title="Recent orders"
          description="Prescription and supply invoices routed through the pharmacy network."
          action={
            <Link href="/portal/orders" className="ws-text-link">
              View all
            </Link>
          }
        >
          {recent.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Status</th>
                    <th>Lines</th>
                    <th>Total</th>
                    <th>Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <Link href={`/portal/orders/${order.id}`}>
                          <b>{order.invoiceNumber}</b>
                        </Link>
                      </td>
                      <td>
                        <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
                      </td>
                      <td>{order._count.lines}</td>
                      <td>{money(order.totalCents)}</td>
                      <td className="muted">{order.createdAt.toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No orders yet"
              body="Start from the formulary price list or open a patient chart after KIAN forwards a paid therapy order."
              action={
                <Link className="btn btn-accent" href="/portal/catalog">
                  Open catalog
                </Link>
              }
            />
          )}
        </SectionCard>

        <div className="ws-stack">
          <SectionCard title="Operate like VitaRelay" description="Everything needed to connect patients → practitioners → pharmacies.">
            <div className="ws-quick-grid">
              <QuickLink href="/portal/patients" title="Patients" body="Charts, intakes, consents & signatures" />
              <QuickLink href="/portal/practitioners" title="Practitioners" body="NPI credentials & signing authority" />
              <QuickLink href="/portal/pharmacies" title="Pharmacies" body="503A / 503B routing & SLAs" />
              <QuickLink href="/portal/price-list" title="Price list" body="Formulary pricing by class" />
              <QuickLink href="/portal/refills" title="Refills" body="Approve before run-out" />
              <QuickLink href="/portal/reports" title="Reports" body="Spend, volume, fulfillment" />
            </div>
          </SectionCard>

          <SectionCard title="Your Wellness Tech rep">
            <div className="ws-rep">
              <div>
                <b>{user.org.assignedRep}</b>
                <p className="muted">Pharmacy decisions stay with licensed fulfillment partners. Message your rep for onboarding, pricing tiers, and credentialing.</p>
              </div>
              <Link className="btn btn-ghost" href="/portal/messages">
                Message {user.org.assignedRep.split(" ")[0]}
              </Link>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
