import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { ensurePharmacyNetwork } from "@/lib/ensure-pharmacies";
import { upsertPharmacy } from "@/lib/admin-actions";
import { parseJsonSafe } from "@/lib/clinical-chart";

export default async function AdminPharmaciesPage() {
  const pharmacies = await ensurePharmacyNetwork();

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Network"
        title="Pharmacies"
        lede="503A, 503B, and hybrid fulfillment partners that power Wellness Tech routing — the VitaRelay pharmacy layer."
      />

      <SectionCard title="Network partners" description="Status, specialties, and SLA for each licensed partner.">
        {pharmacies.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Pharmacy</th>
                  <th>Type</th>
                  <th>Region</th>
                  <th>Status</th>
                  <th>Specialties</th>
                  <th>SLA</th>
                </tr>
              </thead>
              <tbody>
                {pharmacies.map((p) => {
                  const specialties = parseJsonSafe<string[]>(p.specialtiesJson, []);
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/admin/pharmacies/${p.id}`}>
                          <b>{p.name}</b>
                        </Link>
                        <div className="muted">{p.description.slice(0, 80)}{p.description.length > 80 ? "…" : ""}</div>
                      </td>
                      <td>{p.type}</td>
                      <td>{p.region || "—"}</td>
                      <td>
                        <StatusBadge tone={statusTone(p.status)}>{p.status}</StatusBadge>
                      </td>
                      <td>{specialties.slice(0, 3).join(" · ") || "—"}</td>
                      <td className="muted">{p.sla || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No pharmacies" body="Seed the network to begin routing." />
        )}
      </SectionCard>

      <SectionCard title="Add pharmacy partner">
        <form action={upsertPharmacy} className="ws-message-form">
          <div className="ws-kv">
            <label>
              Name
              <input name="name" required placeholder="Partner pharmacy name" />
            </label>
            <label>
              Type
              <select name="type" defaultValue="Hybrid">
                <option>503A</option>
                <option>503B</option>
                <option>Hybrid</option>
                <option>PUO</option>
              </select>
            </label>
            <label>
              Region
              <input name="region" placeholder="National / state" />
            </label>
            <label>
              Status
              <select name="status" defaultValue="online">
                <option value="online">online</option>
                <option value="maintenance">maintenance</option>
              </select>
            </label>
          </div>
          <label>
            Description
            <textarea name="description" rows={3} />
          </label>
          <label>
            SLA
            <input name="sla" placeholder="Ships within 1–3 business days" />
          </label>
          <label>
            Specialties (comma-separated)
            <input name="specialties" placeholder="GLP-1, Peptides, Hormone" />
          </label>
          <button className="btn btn-accent" type="submit">
            Save partner
          </button>
        </form>
      </SectionCard>
    </div>
  );
}
