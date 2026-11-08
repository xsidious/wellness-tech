import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PageHeader,
  SectionCard,
  StatTile,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import {
  refreshConnectedSiteAction,
  setConnectedSiteStatus,
  upsertConnectedSite,
} from "@/lib/admin-actions";
import { readLocalMetrics, readRemoteMetrics } from "@/lib/connected-sites";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function ConnectedSiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ refreshed?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const site = await prisma.connectedSite.findUnique({
    where: { id },
    include: { org: true },
  });
  if (!site) notFound();

  const local = readLocalMetrics(site.localMetricsJson);
  const remote = readRemoteMetrics(site.remoteMetricsJson);
  const source = site.sourceKey || site.slug;

  const [recentOrders, recentPatients] = await Promise.all([
    prisma.order.findMany({
      where: { source },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { clinicalPatient: true },
    }),
    prisma.clinicalPatient.findMany({
      where: { sourceSite: source },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="ws-stack">
      <PageHeader
        kicker={site.kind}
        title={site.displayName}
        lede={`${site.baseUrl || "No base URL"} · source key ${source}`}
        actions={
          <div className="ws-head-actions">
            <Link className="btn btn-ghost" href="/admin/sites">
              All sites
            </Link>
            <form action={refreshConnectedSiteAction}>
              <input type="hidden" name="id" value={site.id} />
              <button className="btn btn-accent" type="submit">
                Refresh metrics
              </button>
            </form>
          </div>
        }
      />
      {q.refreshed ? <p className="note">Metrics refreshed from local WT data and remote overview.</p> : null}

      <div className="ws-stat-grid">
        <StatTile
          label="Status"
          value={site.status}
          tone={site.status === "active" ? "ok" : site.status === "error" ? "warn" : "default"}
        />
        <StatTile label="Open orders" value={local.ordersOpen} tone={local.ordersOpen ? "warn" : "ok"} />
        <StatTile label="Patients in WT" value={local.patients} />
        <StatTile label="Orders · 30d" value={local.orders30d} tone="accent" />
        <StatTile label="Revenue · 30d" value={money(local.revenue30dCents)} />
        <StatTile
          label="Remote users"
          value={remote.ok ? remote.usersTotal ?? "—" : "—"}
          hint={remote.ok ? `${remote.intakesOpen ?? 0} open intakes` : remote.error || "overview offline"}
        />
      </div>

      <div className="ws-split">
        <SectionCard title="Connectivity">
          <ul>
            <li>
              Health:{" "}
              <StatusBadge tone={site.lastHealthOk ? "ok" : "warn"}>
                {site.lastHealthOk ? "up" : "down"}
              </StatusBadge>{" "}
              <span className="muted">{site.lastHealthDetail || "not probed"}</span>
            </li>
            <li>
              Last health check:{" "}
              <span className="muted">{site.lastHealthCheckAt?.toLocaleString() || "—"}</span>
            </li>
            <li>
              Last inbound order:{" "}
              <span className="muted">{site.lastOrderAt?.toLocaleString() || local.lastOrderAt || "—"}</span>
            </li>
            <li>
              Last outbound webhook:{" "}
              <StatusBadge tone={site.lastWebhookOk ? "ok" : "warn"}>
                {site.lastWebhookOk ? "ok" : "fail"}
              </StatusBadge>{" "}
              <span className="muted">{site.lastWebhookAt?.toLocaleString() || "—"}</span>
            </li>
            <li>
              Partner org: <span className="muted">{site.org?.legalName || "—"}</span>
            </li>
            <li>
              Secret env: <code>{site.secretEnvKey}</code>
            </li>
          </ul>
          <div className="ws-head-actions" style={{ marginTop: 12 }}>
            <form action={setConnectedSiteStatus}>
              <input type="hidden" name="id" value={site.id} />
              <input type="hidden" name="status" value={site.status === "paused" ? "active" : "paused"} />
              <button className="btn btn-ghost" type="submit">
                {site.status === "paused" ? "Resume site" : "Pause site"}
              </button>
            </form>
            {site.baseUrl ? (
              <a className="btn btn-ghost" href={site.baseUrl} target="_blank" rel="noreferrer">
                Open website
              </a>
            ) : null}
            <Link className="btn btn-ghost" href={`/admin/orders?q=${encodeURIComponent(source)}`}>
              WT orders
            </Link>
            <Link className="btn btn-ghost" href="/admin/patients">
              Patients
            </Link>
          </div>
        </SectionCard>

        <SectionCard title="Remote overview" description="Pulled from the site’s partner overview endpoint.">
          {remote.ok ? (
            <ul>
              <li>
                Users: <b>{remote.usersTotal ?? 0}</b>
              </li>
              <li>
                Active partners: <b>{remote.partnersActive ?? 0}</b>
              </li>
              <li>
                Site orders: <b>{remote.ordersTotal ?? 0}</b> ({remote.orders30d ?? 0} / 30d)
              </li>
              <li>
                Intakes: <b>{remote.intakesTotal ?? 0}</b> ({remote.intakesOpen ?? 0} open)
              </li>
              <li>
                Bookings · 30d: <b>{remote.bookings30d ?? 0}</b>
              </li>
              <li className="muted">Fetched {remote.fetchedAt || "—"} · env {remote.environment || "—"}</li>
            </ul>
          ) : (
            <p className="muted">{remote.error || "Run Refresh metrics to pull remote data."}</p>
          )}
          {remote.usersByRole && Object.keys(remote.usersByRole).length ? (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Users</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(remote.usersByRole).map(([role, count]) => (
                    <tr key={role}>
                      <td>{role}</td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </SectionCard>
      </div>

      <SectionCard title="Recent WT orders from this site">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Patient</th>
                <th>Status</th>
                <th>Total</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link className="ws-text-link" href={`/admin/orders/${order.id}`}>
                      {order.invoiceNumber}
                    </Link>
                    {order.partnerExternalRef ? <div className="muted">{order.partnerExternalRef}</div> : null}
                  </td>
                  <td>{order.clinicalPatient?.fullName || "—"}</td>
                  <td>
                    <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
                  </td>
                  <td>{money(order.totalCents)}</td>
                  <td className="muted">{order.createdAt.toLocaleString()}</td>
                </tr>
              ))}
              {!recentOrders.length ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No orders tagged with source {source}.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Recent patients mirrored from this site">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Intake</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {recentPatients.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link className="ws-text-link" href={`/admin/patients/${p.id}`}>
                      {p.fullName}
                    </Link>
                    <div className="muted">{p.email}</div>
                  </td>
                  <td className="muted">{p.kianIntakeId || p.kianReference || "—"}</td>
                  <td>{p.intakeStatus || "—"}</td>
                  <td className="muted">{p.updatedAt.toLocaleString()}</td>
                </tr>
              ))}
              {!recentPatients.length ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No clinical patients with sourceSite {source}.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Edit site">
        <form action={upsertConnectedSite} className="ws-message-form">
          <input type="hidden" name="id" value={site.id} />
          <div className="ws-kv">
            <label>
              Display name
              <input name="displayName" defaultValue={site.displayName} required />
            </label>
            <label>
              Slug
              <input name="slug" defaultValue={site.slug} required />
            </label>
            <label>
              Source key
              <input name="sourceKey" defaultValue={site.sourceKey} />
            </label>
            <label>
              Kind
              <select name="kind" defaultValue={site.kind}>
                <option value="storefront">Storefront</option>
                <option value="clinical">Clinical portal</option>
                <option value="partner">Partner app</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Base URL
              <input name="baseUrl" defaultValue={site.baseUrl} />
            </label>
            <label>
              Overview path
              <input name="overviewPath" defaultValue={site.overviewPath} />
            </label>
            <label>
              Health path
              <input name="healthPath" defaultValue={site.healthPath} />
            </label>
            <label>
              Status webhook path
              <input name="statusWebhookPath" defaultValue={site.statusWebhookPath} />
            </label>
            <label>
              Secret env key
              <input name="secretEnvKey" defaultValue={site.secretEnvKey} />
            </label>
            <label>
              Status
              <select name="status" defaultValue={site.status}>
                <option value="active">active</option>
                <option value="paused">paused</option>
                <option value="error">error</option>
              </select>
            </label>
          </div>
          <label>
            Notes
            <textarea name="notes" rows={3} defaultValue={site.notes} />
          </label>
          <button className="btn btn-accent" type="submit">
            Save site
          </button>
        </form>
      </SectionCard>
    </div>
  );
}
