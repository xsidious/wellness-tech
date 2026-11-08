import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatTile,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import {
  refreshAllConnectedSitesAction,
  upsertConnectedSite,
} from "@/lib/admin-actions";
import {
  ensureConnectedSites,
  readLocalMetrics,
  readRemoteMetrics,
} from "@/lib/connected-sites";
import { money } from "@/lib/money";

export default async function ConnectedSitesPage({
  searchParams,
}: {
  searchParams: Promise<{ refreshed?: string }>;
}) {
  const q = await searchParams;
  const sites = await ensureConnectedSites();
  const localAll = sites.map((s) => readLocalMetrics(s.localMetricsJson));
  const openTotal = localAll.reduce((n, m) => n + m.ordersOpen, 0);
  const patientsTotal = localAll.reduce((n, m) => n + m.patients, 0);
  const orders30d = localAll.reduce((n, m) => n + m.orders30d, 0);
  const unhealthy = sites.filter((s) => s.status === "error" || s.lastHealthOk === false).length;

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Network control"
        title="Connected sites"
        lede="Monitor every website that routes patients, orders, or intakes into Wellness Tech — health, users, and fulfillment load."
        actions={
          <form action={refreshAllConnectedSitesAction}>
            <button className="btn btn-accent" type="submit">
              Refresh all
            </button>
          </form>
        }
      />
      {q.refreshed ? <p className="note">Site metrics refreshed.</p> : null}

      <div className="ws-stat-grid">
        <StatTile label="Sites" value={sites.length} />
        <StatTile label="Open WT orders" value={openTotal} tone={openTotal ? "warn" : "ok"} />
        <StatTile label="Patients (all sites)" value={patientsTotal} />
        <StatTile label="Orders · 30d" value={orders30d} tone="accent" />
        <StatTile label="Needs attention" value={unhealthy} tone={unhealthy ? "warn" : "ok"} />
      </div>

      <SectionCard title="Registered sites" description="Local WT data plus remote overview when the site exposes a partner metrics endpoint.">
        {sites.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Health</th>
                  <th>WT orders</th>
                  <th>Remote users</th>
                  <th>Open intakes</th>
                  <th>Last order</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => {
                  const local = readLocalMetrics(site.localMetricsJson);
                  const remote = readRemoteMetrics(site.remoteMetricsJson);
                  return (
                    <tr key={site.id}>
                      <td>
                        <b>{site.displayName}</b>
                        <div className="muted">
                          {site.kind} · {site.slug}
                        </div>
                        {site.baseUrl ? (
                          <div className="muted" style={{ wordBreak: "break-all" }}>
                            {site.baseUrl}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <StatusBadge tone={statusTone(site.status)}>{site.status}</StatusBadge>
                        <div className="muted">
                          {site.lastHealthCheckAt
                            ? `${site.lastHealthOk ? "up" : "down"} · ${site.lastHealthDetail || "—"}`
                            : "not probed"}
                        </div>
                      </td>
                      <td>
                        {local.ordersOpen} open / {local.ordersTotal} total
                        <div className="muted">{money(local.revenue30dCents)} · 30d</div>
                      </td>
                      <td>
                        {remote.ok ? remote.usersTotal ?? "—" : remote.error ? "—" : "—"}
                        <div className="muted">
                          {remote.ok
                            ? `${remote.partnersActive ?? 0} active partners`
                            : remote.error || "overview pending"}
                        </div>
                      </td>
                      <td>{remote.ok ? remote.intakesOpen ?? "—" : "—"}</td>
                      <td className="muted">
                        {site.lastOrderAt ? site.lastOrderAt.toLocaleString() : local.lastOrderAt || "—"}
                      </td>
                      <td>
                        <Link className="btn btn-ghost" href={`/admin/sites/${site.id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No connected sites" body="Register KIAN Privé or another storefront below." />
        )}
      </SectionCard>

      <SectionCard title="Register a site" description="Add another website that will call the WT partner order API.">
        <form action={upsertConnectedSite} className="ws-message-form">
          <div className="ws-kv">
            <label>
              Display name
              <input name="displayName" required placeholder="KIAN Privé" />
            </label>
            <label>
              Slug
              <input name="slug" required placeholder="kian-prive" />
            </label>
            <label>
              Source key
              <input name="sourceKey" placeholder="kian-prive (Order.source)" />
            </label>
            <label>
              Kind
              <select name="kind" defaultValue="storefront">
                <option value="storefront">Storefront</option>
                <option value="clinical">Clinical portal</option>
                <option value="partner">Partner app</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Base URL
              <input name="baseUrl" placeholder="https://www.example.com" />
            </label>
            <label>
              Overview path
              <input name="overviewPath" defaultValue="/api/webhooks/wellness-tech-overview" />
            </label>
            <label>
              Health path
              <input name="healthPath" defaultValue="/" />
            </label>
            <label>
              Status webhook path
              <input name="statusWebhookPath" defaultValue="/api/webhooks/wellness-tech-order" />
            </label>
            <label>
              Secret env key
              <input name="secretEnvKey" defaultValue="WT_PARTNER_ORDER_SECRET" />
            </label>
          </div>
          <label>
            Notes
            <textarea name="notes" rows={3} placeholder="What this site sends into WT…" />
          </label>
          <button className="btn btn-accent" type="submit">
            Add connected site
          </button>
        </form>
      </SectionCard>
    </div>
  );
}
