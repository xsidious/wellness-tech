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

function last14DayBuckets() {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (13 - i));
    return d;
  });
}

export default async function PortalHome() {
  const user = await requireUser();
  const roles = rolesOf(user.roles);
  const affiliateOnly =
    roles.includes("affiliate") && !roles.includes("owner") && !roles.includes("prescriber");

  if (affiliateOnly) {
    const [referredOrgs, pendingCommission, recentCommissions] = await Promise.all([
      prisma.organization.count({ where: { referringAffiliateId: user.id } }),
      prisma.commission.aggregate({
        where: { affiliateUserId: user.id, status: "pending_batch" },
        _sum: { amountCents: true },
        _count: true,
      }),
      prisma.commission.findMany({
        where: { affiliateUserId: user.id },
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { order: { select: { invoiceNumber: true, id: true } } },
      }),
    ]);

    return (
      <div className="ws-stack">
        <PageHeader
          kicker="Affiliate"
          title={`Welcome back, ${user.name}`}
          lede={`Code ${user.affiliate?.code || "—"}. Commission posts when a referred practice’s device or supply order is delivered.`}
          actions={
            <div className="ws-head-actions">
              <Link className="btn btn-ghost" href="/portal/education">
                Materials
              </Link>
              <Link className="btn btn-accent" href="/portal/affiliate">
                View statements
              </Link>
            </div>
          }
        />
        <div className="ws-stat-grid">
          <StatTile label="Referral code" value={user.affiliate?.code || "—"} hint="Share with practices" tone="accent" />
          <StatTile label="Referred practices" value={referredOrgs} hint="Attributed to your code" />
          <StatTile
            label="Pending payout"
            value={money(pendingCommission._sum.amountCents || 0)}
            hint={`${pendingCommission._count} commission line${pendingCommission._count === 1 ? "" : "s"}`}
            tone={pendingCommission._count ? "warn" : "ok"}
          />
        </div>
        <div className="ws-split">
          <SectionCard
            title="Recent commissions"
            description="Paid when eligible referred orders deliver."
            action={
              <Link href="/portal/affiliate" className="ws-text-link">
                All statements
              </Link>
            }
          >
            {recentCommissions.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentCommissions.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <b>{row.order.invoiceNumber}</b>
                        </td>
                        <td>{money(row.amountCents)}</td>
                        <td>
                          <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge>
                        </td>
                        <td className="muted">{row.createdAt.toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No commissions yet"
                body="Share your partner link. Device and supply orders from referred practices appear here after delivery."
              />
            )}
          </SectionCard>
          <SectionCard title="Grow your book" description="Tools for recruiting and educating practices.">
            <div className="ws-quick-grid">
              <QuickLink href="/portal/affiliate" title="Commissions" body="Payouts and referred practice activity" />
              <QuickLink href="/portal/education" title="Materials" body="Shareable decks and product education" />
              <QuickLink
                href={user.affiliate?.partnerLink || `/signup?ref=${user.affiliate?.code || ""}`}
                title="Partner link"
                body="Send practices to signup with your code"
              />
            </div>
          </SectionCard>
        </div>
      </div>
    );
  }

  const dayBuckets = last14DayBuckets();
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
    credential,
    recentPatients,
    recentVolume,
    unreadAlerts,
    teamWithoutNpi,
  ] = await Promise.all([
    prisma.order.count({
      where: { orgId: user.orgId, status: { notIn: ["delivered", "cancelled", "canceled"] } },
    }),
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
    prisma.prescriberCredential.findUnique({ where: { userId: user.id } }),
    prisma.clinicalPatient.findMany({
      where: { orgId: user.orgId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, fullName: true, email: true, updatedAt: true, sourceSite: true },
    }),
    prisma.order.findMany({
      where: { orgId: user.orgId, createdAt: { gte: dayBuckets[0] } },
      select: { createdAt: true, totalCents: true },
    }),
    prisma.appNotification.count({
      where: {
        orgId: user.orgId,
        readAt: null,
        OR: [{ userId: "" }, { userId: user.id }],
      },
    }),
    roles.includes("prescriber") || roles.includes("owner")
      ? prisma.user.count({
          where: {
            orgId: user.orgId,
            OR: [{ roles: { contains: "prescriber" } }, { roles: { contains: "owner" } }],
            credential: null,
          },
        })
      : Promise.resolve(0),
  ]);

  const volumeByDay = dayBuckets.map((day) => {
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const rows = recentVolume.filter((o) => o.createdAt >= day && o.createdAt < next);
    return {
      label: day.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      count: rows.length,
      cents: rows.reduce((s, r) => s + r.totalCents, 0),
    };
  });
  const maxVol = Math.max(1, ...volumeByDay.map((d) => d.count));
  const weekSpend = volumeByDay.slice(-7).reduce((s, d) => s + d.cents, 0);

  const attention: AttentionItem[] = [];
  if (!user.org.onboardingComplete) {
    attention.push({ href: "/portal/settings", label: "Finish practice onboarding", tone: "warn" });
  }
  if ((roles.includes("prescriber") || roles.includes("owner")) && !credential?.npi) {
    attention.push({ href: "/signup/npi", label: "Add NPI and state license", tone: "warn" });
  }
  if (teamWithoutNpi > 0) {
    attention.push({
      href: "/portal/practitioners",
      label: `${teamWithoutNpi} clinician${teamWithoutNpi === 1 ? "" : "s"} missing credentials`,
      tone: "warn",
    });
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
  if (unreadAlerts) {
    attention.push({
      href: "/portal/notifications",
      label: `${unreadAlerts} unread notification${unreadAlerts === 1 ? "" : "s"}`,
      tone: "info",
    });
  }

  return (
    <div className="ws-stack">
      <PageHeader
        kicker={tierLabel(user.org.verificationTier)}
        title={user.org.legalName}
        lede={
          user.org.clinicCode
            ? `${user.org.legalName} clinic portal — your patients, VitaRelay fulfillment, and formulary orders stay scoped to this practice.`
            : "Patients, credentials, pharmacy fulfillment, and ordering — one practice workspace."
        }
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
        <StatTile label="Open orders" value={openOrders} hint="In fulfillment" tone="accent" />
        <StatTile
          label="Awaiting signature"
          value={pendingEscripts}
          hint="eScripts to sign"
          tone={pendingEscripts ? "warn" : "ok"}
        />
        <StatTile
          label="Refills due"
          value={dueRefills + openRefillRequests}
          hint={`${dueRefills} scheduled · ${openRefillRequests} requests`}
          tone={dueRefills || openRefillRequests ? "warn" : "ok"}
        />
        <StatTile
          label="Unpaid invoices"
          value={unpaidInvoices}
          hint="Needs payment follow-up"
          tone={unpaidInvoices ? "warn" : "ok"}
        />
        <StatTile label="Patients" value={patients} hint="Clinical charts on file" />
        <StatTile
          label="7-day spend"
          value={money(weekSpend)}
          hint={`${spendAgg._count} lifetime invoices · ${money(spendAgg._sum.totalCents || 0)} total`}
        />
      </div>

      <div className="ws-split">
        <SectionCard title="Order volume" description="Last 14 days · practice invoices opened">
          <div className="ws-bars" role="img" aria-label="Order volume for the last 14 days">
            {volumeByDay.map((d) => (
              <div key={d.label} className="ws-bar-col" title={`${d.label}: ${d.count} orders · ${money(d.cents)}`}>
                <div className="ws-bar-track">
                  <div
                    className="ws-bar"
                    style={{ height: `${Math.max(d.count ? 12 : 4, (d.count / maxVol) * 100)}%` }}
                  />
                </div>
                <span>{d.label.split(" ")[1] || d.label}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Recent patients"
          description="Latest charts updated in your practice."
          action={
            <Link href="/portal/patients" className="ws-text-link">
              All patients
            </Link>
          }
        >
          {recentPatients.length ? (
            <ul className="ws-feed">
              {recentPatients.map((patient) => (
                <li key={patient.id}>
                  <Link href={`/portal/patients/${patient.id}`}>
                    <strong>{patient.fullName}</strong>
                    <span>
                      {patient.sourceSite || "chart"} · {patient.updatedAt.toLocaleDateString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No patients yet"
              body="Charts appear when you add a patient or when a connected site (like KIAN) forwards an intake."
              action={
                <Link className="btn btn-accent" href="/portal/patients">
                  Open patients
                </Link>
              }
            />
          )}
        </SectionCard>
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
          <SectionCard title="Practice shortcuts" description="Day-to-day routes for clinical ops and ordering.">
            <div className="ws-quick-grid">
              <QuickLink href="/portal/patients" title="Patients" body="Charts, intakes, consents & signatures" />
              <QuickLink href="/portal/practitioners" title="Credentials" body="NPI & signing authority" />
              <QuickLink href="/portal/script-requests" title="Script requests" body="Sign pending eScripts" />
              <QuickLink href="/portal/refills" title="Refills" body="Approve before run-out" />
              <QuickLink href="/portal/pharmacies" title="Pharmacies" body="503A / 503B routing & SLAs" />
              <QuickLink href="/portal/price-list" title="Price list" body="Formulary pricing by class" />
              <QuickLink href="/portal/invoices" title="Invoices" body="Wholesale & patient billing" />
              <QuickLink href="/portal/reports" title="Reports" body="Spend, volume, fulfillment" />
            </div>
          </SectionCard>

          <SectionCard title="Your Wellness Tech rep">
            <div className="ws-rep">
              <div>
                <b>{user.org.assignedRep}</b>
                <p className="muted">
                  Pharmacy decisions stay with licensed fulfillment partners. Message your rep for onboarding, pricing
                  tiers, and credentialing.
                </p>
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
