import Link from "next/link";
import { PharmacyPartnerForm } from "@/components/admin/PharmacyPartnerForm";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { parseJsonSafe } from "@/lib/clinical-chart";
import { ensurePharmacyNetwork } from "@/lib/ensure-pharmacies";
import { prisma } from "@/lib/prisma";

export default async function AdminPharmaciesPage() {
  await ensurePharmacyNetwork();
  const pharmacies = await prisma.pharmacy.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { orders: true, locations: true, users: true } },
    },
  });

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Network"
        title="Pharmacies"
        lede="Licensed 503A / 503B / hybrid partners — licensing, contacts, ship modes, and routing profile in one place."
      />

      <SectionCard title={`${pharmacies.length} network partners`} flush>
        {pharmacies.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Pharmacy</th>
                  <th>Type</th>
                  <th>License / NPI</th>
                  <th>Contact</th>
                  <th>Coverage</th>
                  <th>Ship</th>
                  <th>Status</th>
                  <th>Volume</th>
                </tr>
              </thead>
              <tbody>
                {pharmacies.map((p) => {
                  const specialties = parseJsonSafe<string[]>(p.specialtiesJson, []);
                  const states = parseJsonSafe<string[]>(p.statesServedJson, []);
                  const shipBits = [
                    p.practiceShip ? "Practice" : null,
                    p.patientShip ? "Patient" : null,
                    p.coldChain ? "Cold-chain" : null,
                  ].filter(Boolean);
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/admin/pharmacies/${p.id}`}>
                          <b>{p.name}</b>
                        </Link>
                        <div className="muted">{p.legalName || p.region || "—"}</div>
                        <div className="muted">
                          {specialties.slice(0, 3).join(" · ") || p.description.slice(0, 72) || "—"}
                          {specialties.length > 3 ? "…" : ""}
                        </div>
                      </td>
                      <td>{p.type}</td>
                      <td>
                        <div>{p.licenseState && p.licenseNumber ? `${p.licenseState} ${p.licenseNumber}` : p.licenseNumber || "—"}</div>
                        <div className="muted">{p.npi ? `NPI ${p.npi}` : "No NPI"}</div>
                      </td>
                      <td>
                        <div>{p.contactName || "—"}</div>
                        <div className="muted">{p.contactEmail || p.phone || "—"}</div>
                      </td>
                      <td className="muted">
                        {states.length ? states.slice(0, 6).join(", ") + (states.length > 6 ? "…" : "") : p.region || "—"}
                      </td>
                      <td className="muted">{shipBits.join(" · ") || "—"}</td>
                      <td>
                        <StatusBadge tone={statusTone(p.status)}>{p.status}</StatusBadge>
                        <div className="muted">{p.sla || "No SLA"}</div>
                      </td>
                      <td>
                        <div>{p._count.orders} orders</div>
                        <div className="muted">
                          {p._count.locations} sites · {p._count.users} staff
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No pharmacies" body="Add the first partner below to begin routing." />
        )}
      </SectionCard>

      <SectionCard
        title="Add pharmacy partner"
        description="Capture licensing, HQ contact, ship modes, specialties, and integrations before routing live orders."
      >
        <PharmacyPartnerForm submitLabel="Create pharmacy partner" />
      </SectionCard>
    </div>
  );
}
