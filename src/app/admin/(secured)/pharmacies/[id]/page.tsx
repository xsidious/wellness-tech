import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, SectionCard, StatusBadge, statusTone } from "@/components/portal/Workspace";
import { upsertPharmacy } from "@/lib/admin-actions";
import { parseJsonSafe } from "@/lib/clinical-chart";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function AdminPharmacyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id },
    include: {
      orders: { orderBy: { createdAt: "desc" }, take: 20, include: { org: true } },
      locations: true,
      _count: { select: { orders: true, users: true } },
    },
  });
  if (!pharmacy) notFound();

  const specialties = parseJsonSafe<string[]>(pharmacy.specialtiesJson, []);
  const capabilities = parseJsonSafe<string[]>(pharmacy.capabilitiesJson, []);
  const erp = parseJsonSafe<string[]>(pharmacy.erpJson, []);

  return (
    <div className="ws-stack">
      <PageHeader
        kicker={pharmacy.type}
        title={pharmacy.name}
        lede={pharmacy.description || "Network fulfillment partner."}
        actions={
          <Link className="btn btn-ghost" href="/admin/pharmacies">
            All pharmacies
          </Link>
        }
      />

      <div className="ws-stat-grid">
        <div className="ws-stat">
          <span className="ws-stat-label">Status</span>
          <strong className="ws-stat-value" style={{ fontSize: "1.1rem" }}>
            <StatusBadge tone={statusTone(pharmacy.status)}>{pharmacy.status}</StatusBadge>
          </strong>
        </div>
        <div className="ws-stat ws-stat-accent">
          <span className="ws-stat-label">Orders routed</span>
          <strong className="ws-stat-value">{pharmacy._count.orders}</strong>
        </div>
        <div className="ws-stat">
          <span className="ws-stat-label">Staff seats</span>
          <strong className="ws-stat-value">{pharmacy._count.users}</strong>
        </div>
      </div>

      <div className="ws-split">
        <SectionCard title="Profile">
          <div className="ws-kv">
            <div>
              <span>Region</span>
              <strong>{pharmacy.region || "—"}</strong>
            </div>
            <div>
              <span>SLA</span>
              <strong>{pharmacy.sla || "—"}</strong>
            </div>
            <div>
              <span>Specialties</span>
              <strong>{specialties.join(" · ") || "—"}</strong>
            </div>
            <div>
              <span>Capabilities</span>
              <strong>{capabilities.join(" · ") || "—"}</strong>
            </div>
            <div>
              <span>Connectivity</span>
              <strong>{erp.join(" · ") || "—"}</strong>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Edit partner">
          <form action={upsertPharmacy} className="ws-message-form">
            <input type="hidden" name="id" value={pharmacy.id} />
            <label>
              Name
              <input name="name" defaultValue={pharmacy.name} required />
            </label>
            <label>
              Type
              <select name="type" defaultValue={pharmacy.type}>
                <option>503A</option>
                <option>503B</option>
                <option>Hybrid</option>
                <option>PUO</option>
              </select>
            </label>
            <label>
              Status
              <select name="status" defaultValue={pharmacy.status}>
                <option value="online">online</option>
                <option value="maintenance">maintenance</option>
              </select>
            </label>
            <label>
              Region
              <input name="region" defaultValue={pharmacy.region} />
            </label>
            <label>
              SLA
              <input name="sla" defaultValue={pharmacy.sla} />
            </label>
            <label>
              Description
              <textarea name="description" rows={3} defaultValue={pharmacy.description} />
            </label>
            <label>
              Specialties
              <input name="specialties" defaultValue={specialties.join(", ")} />
            </label>
            <button className="btn btn-accent" type="submit">
              Save changes
            </button>
          </form>
        </SectionCard>
      </div>

      <SectionCard title="Recent routed orders">
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
              {pharmacy.orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/admin/orders/${o.id}`}>{o.invoiceNumber}</Link>
                  </td>
                  <td>{o.org.legalName}</td>
                  <td>
                    <StatusBadge tone={statusTone(o.status)}>{o.status}</StatusBadge>
                  </td>
                  <td>{money(o.totalCents)}</td>
                </tr>
              ))}
              {!pharmacy.orders.length ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No orders routed here yet.
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
