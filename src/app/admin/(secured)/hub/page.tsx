import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatTile,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { refreshAllConnectedSitesAction } from "@/lib/admin-actions";
import {
  ensureConnectedSites,
  readLocalMetrics,
  readRemoteMetrics,
  type SiteRemoteMetrics,
} from "@/lib/connected-sites";
import { money } from "@/lib/money";
import { probeEventideReadiness } from "@/lib/eventide-readiness";
import { PARTNER_ROUTING } from "@/lib/partner-routing";
import { prisma } from "@/lib/prisma";

function queueItems(remote: SiteRemoteMetrics) {
  return remote.processingQueue || { openIntakes: [], openProposals: [], recentOrders: [] };
}

export default async function HubControlPage({
  searchParams,
}: {
  searchParams: Promise<{ refreshed?: string }>;
}) {
  const q = await searchParams;
  const [sites, patientsOpen, ordersOpen, prescriptionsPending, eventidePharmacy, latestVrOrder] =
    await Promise.all([
      ensureConnectedSites(),
      prisma.clinicalPatient.count({
        where: {
          kianIntakeId: { not: "" },
          intakeStatus: { notIn: ["", "APPROVED", "CLOSED", "DECLINED", "PAID"] },
        },
      }),
      prisma.order.count({ where: { status: { notIn: ["delivered", "cancelled", "canceled"] } } }),
      prisma.order.count({ where: { escriptStatus: "pending_signature" } }),
      prisma.pharmacy.findFirst({ where: { name: { contains: "Eventide", mode: "insensitive" } } }),
      prisma.order.findFirst({
        where: { rxhereOrderId: { not: "" } },
        orderBy: { createdAt: "desc" },
        select: { rxhereOrderId: true, invoiceNumber: true, status: true },
      }),
    ]);
  const eventide = await probeEventideReadiness(latestVrOrder?.rxhereOrderId || undefined);

  const kian = sites.find((s) => s.slug === "kian-prive");
  const remote = kian ? readRemoteMetrics(kian.remoteMetricsJson) : {};
  const local = kian ? readLocalMetrics(kian.localMetricsJson) : null;
  const queue = queueItems(remote);

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Network hub"
        title="Operations control"
        lede="KIAN Privé processes intakes, telemedicine, bloodwork, therapy, and payments today. Wellness Tech is the fulfillment hub — oversee patients, prescriptions, pharmacy routing (VitaRelay/Eventide), subscriptions, and partner sites here."
        actions={
          <div className="ws-head-actions">
            <Link className="btn btn-ghost" href="/admin/sites">
              Connected sites
            </Link>
            <form action={refreshAllConnectedSitesAction}>
              <button className="btn btn-accent" type="submit">
                Refresh hub metrics
              </button>
            </form>
          </div>
        }
      />
      {q.refreshed ? <p className="note">Hub metrics refreshed from KIAN + partner sites.</p> : null}

      <div className="ws-stat-grid">
        <StatTile label="Processor" value="KIAN Privé" hint="Clinical + payment now" tone="accent" />
        <StatTile label="Fulfillment hub" value="Wellness Tech" hint="Pharmacy + clinic portals" />
        <StatTile
          label="Open intakes (KIAN)"
          value={remote.intakesOpen ?? "—"}
          tone={remote.intakesOpen ? "warn" : "ok"}
        />
        <StatTile label="Mirrored open charts" value={patientsOpen} hint="WT ClinicalPatient" />
        <StatTile label="Open WT orders" value={ordersOpen} tone={ordersOpen ? "warn" : "ok"} />
        <StatTile
          label="Therapy subs active"
          value={remote.therapySubsActive ?? "—"}
          hint={`Past due ${remote.therapySubsPastDue ?? 0}`}
        />
        <StatTile label="Clinical SKUs (KIAN)" value={remote.clinicalProducts ?? "—"} />
        <StatTile
          label="Distribution errors"
          value={remote.distributionErrors ?? 0}
          tone={remote.distributionErrors ? "warn" : "ok"}
        />
      </div>

      <SectionCard
        title="Clinical capabilities (on KIAN)"
        description="Answer for ops: what lives in the processor today vs what is fulfillment-only on Wellness Tech."
      >
        <ul className="ws-steps">
          <li>
            <b>Telemedicine</b> — yes on KIAN (bookings + physician telemedicine consults). Not a separate multi-state IDN marketplace; out-of-state coverage for partners follows each site’s routing rule (e.g. 4everglow uses telehealth OOS).
          </li>
          <li>
            <b>Bloodwork / labs</b> — yes on KIAN (comprehensive bloodwork booking, lab-panel services, NEEDS_LABS intake status).
          </li>
          <li>
            <b>Pharmacy / Rx fulfillment</b> — Wellness Tech → VitaRelay / Eventide after KIAN payment.
          </li>
        </ul>
      </SectionCard>

      <SectionCard
        title="Partner routing rules"
        description="Source of truth from Alycia — do not treat every connected site as an independent clinic."
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Partner</th>
                <th>Kind</th>
                <th>Clinic?</th>
                <th>Routing</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(PARTNER_ROUTING).map((row) => (
                <tr key={row.site}>
                  <td>
                    <b>{row.label}</b>
                  </td>
                  <td>
                    <code>{row.kind}</code>
                  </td>
                  <td>{row.isClinic ? "Yes" : "No"}</td>
                  <td className="muted">{row.routingNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Eventide / VitaRelay connection"
        description="We place through Eventide software (VitaRelay Practice API) using Eventide’s physicians and pharmacy network."
      >
        <div className="ws-stat-grid">
          <StatTile
            label="API key"
            value={eventide.keyKind}
            tone={eventide.keyKind === "live" ? "ok" : "warn"}
            hint={eventide.configured ? eventide.baseUrl.replace("https://", "") : "missing"}
          />
          <StatTile
            label="Connection"
            value={eventide.ok ? "Ready" : "Blocked"}
            tone={eventide.ok ? "ok" : "warn"}
            hint={eventide.samplePrescriber || "roster"}
          />
          <StatTile
            label="Latest VR order"
            value={eventide.sampleOrder?.orderNumber || latestVrOrder?.invoiceNumber || "—"}
            tone={
              String(eventide.sampleOrder?.paymentStatus || eventide.sampleOrder?.status || "")
                .toLowerCase()
                .includes("awaiting")
                ? "warn"
                : "default"
            }
            hint={
              eventide.sampleOrder
                ? `${eventide.sampleOrder.status || "—"} / ${eventide.sampleOrder.paymentStatus || "—"}`
                : latestVrOrder?.status || "none yet"
            }
          />
          <StatTile
            label="Eventide pharmacy"
            value={eventidePharmacy?.name?.replace(/rxhere/gi, "Eventide") || "Eventide / VitaRelay"}
            hint={eventidePharmacy?.region || "VitaRelay routes fulfillment"}
          />
        </div>
        {eventide.blockers.length ? (
          <ul className="ws-steps">
            {eventide.blockers.map((b) => (
              <li key={b}>
                <b>Blocker:</b> {b}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No blockers detected on the Practice API credentials.</p>
        )}
        <ul className="ws-steps">
          {eventide.nextSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
        <p className="muted">
          KIAN status callback: <code>{eventide.kianCallbackUrl}</code>
          {eventide.sampleOrder?.environment ? (
            <>
              {" "}
              · remote env <code>{eventide.sampleOrder.environment}</code>
            </>
          ) : null}
        </p>
        <div className="ws-head-actions">
          <a className="btn btn-accent" href="https://vitarelay.com/login" target="_blank" rel="noreferrer">
            Open Eventide / VitaRelay login
          </a>
          <Link className="btn btn-ghost" href="/admin/orders">
            WT orders
          </Link>
          <Link className="btn btn-ghost" href="/admin/pharmacies">
            Pharmacy network
          </Link>
          <Link className="btn btn-ghost" href="/admin/products">
            Formulary
          </Link>
        </div>
      </SectionCard>

      <div className="ws-split">
        <SectionCard
          title="Open intakes (from KIAN)"
          description="Live processing queue mirrored via overview + intake sync."
        >
          {queue.openIntakes?.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Status</th>
                    <th>Site</th>
                    <th>Therapy</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.openIntakes.map((row) => (
                    <tr key={String(row.id)}>
                      <td>
                        <b>{String(row.fullName || "—")}</b>
                        <div className="muted">{String(row.email || "")}</div>
                      </td>
                      <td>
                        <StatusBadge tone={statusTone(String(row.status || ""))}>
                          {String(row.status || "—")}
                        </StatusBadge>
                      </td>
                      <td>{String(row.source || "—")}</td>
                      <td>
                        {row.proposalStatus
                          ? `${String(row.proposalStatus)}${
                              row.proposalTotalCents != null ? ` · ${money(Number(row.proposalTotalCents))}` : ""
                            }`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No open intakes in last refresh"
              body="Click Refresh hub metrics, or process an intake on KIAN — it will sync here."
            />
          )}
        </SectionCard>

        <SectionCard title="Open therapy proposals" description="Draft / sent / accepted plans awaiting payment.">
          {queue.openProposals?.length ? (
            <ul className="ws-steps">
              {queue.openProposals.map((row) => (
                <li key={String(row.id)}>
                  <b>{String(row.patient || "Patient")}</b> · {String(row.status)} ·{" "}
                  {money(Number(row.totalCents || 0))} · {String(row.interval || "")}
                  <div className="muted">{String(row.email || "")}</div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No open proposals" body="Therapy plans appear when clinicians send them on KIAN." />
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Recent paid / distribution orders"
        description="KIAN orders with WT/VitaRelay fulfillment status."
        action={
          <Link href="/admin/orders" className="ws-text-link">
            All WT orders
          </Link>
        }
      >
        {queue.recentOrders?.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>KIAN status</th>
                  <th>Distribution</th>
                  <th>VitaRelay</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {queue.recentOrders.map((row) => (
                  <tr key={String(row.id)}>
                    <td>
                      <b>{String(row.orderNumber || row.id)}</b>
                    </td>
                    <td>
                      {String(row.status || "—")} / {String(row.fulfillmentStatus || "—")}
                    </td>
                    <td>{String(row.distributionStatus || "—")}</td>
                    <td>
                      <code>{String(row.rxhereOrderId || "—").slice(0, 12)}</code>
                    </td>
                    <td>{money(Number(row.totalCents || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No recent KIAN orders in metrics" body="Refresh after a paid therapy order forwards to WT." />
        )}
      </SectionCard>

      <SectionCard
        title="Partner portals"
        description="Each partner org sees only its patients and orders. Hope & Haven is a referral partner (not a clinic)."
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Site</th>
                <th>WT patients</th>
                <th>Open orders</th>
                <th>Remote intakes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => {
                const m = readLocalMetrics(site.localMetricsJson);
                const r = readRemoteMetrics(site.remoteMetricsJson);
                const routing = PARTNER_ROUTING[site.sourceKey as keyof typeof PARTNER_ROUTING];
                return (
                  <tr key={site.id}>
                    <td>
                      <b>{site.displayName}</b>
                      <div className="muted">
                        {site.kind}
                        {routing && !routing.isClinic ? " · not a clinic" : ""}
                      </div>
                    </td>
                    <td>{m.patients}</td>
                    <td>{m.ordersOpen}</td>
                    <td>{site.slug === "kian-prive" ? r.intakesOpen ?? "—" : "via KIAN"}</td>
                    <td>
                      <Link className="btn btn-ghost" href={`/admin/sites/${site.id}`}>
                        Detail
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {local ? (
          <p className="muted">
            KIAN local WT lane: {local.ordersTotal} orders · {money(local.revenue30dCents)} last 30d · last order{" "}
            {local.lastOrderAt ? new Date(local.lastOrderAt).toLocaleString() : "—"}
          </p>
        ) : null}
      </SectionCard>
    </div>
  );
}
