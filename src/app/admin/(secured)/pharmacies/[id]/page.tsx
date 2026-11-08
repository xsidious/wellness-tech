import Link from "next/link";
import { notFound } from "next/navigation";
import { PharmacyPartnerForm } from "@/components/admin/PharmacyPartnerForm";
import { PageHeader, SectionCard, StatusBadge, statusTone } from "@/components/portal/Workspace";
import { parseJsonSafe } from "@/lib/clinical-chart";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function AdminPharmacyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id },
    include: {
      orders: {
        orderBy: { createdAt: "desc" },
        take: 25,
        include: { org: true, clinicalPatient: true },
      },
      locations: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
      users: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, roles: true } },
      _count: { select: { orders: true, users: true, locations: true } },
    },
  });
  if (!pharmacy) notFound();

  const specialties = parseJsonSafe<string[]>(pharmacy.specialtiesJson, []);
  const capabilities = parseJsonSafe<string[]>(pharmacy.capabilitiesJson, []);
  const erp = parseJsonSafe<string[]>(pharmacy.erpJson, []);
  const states = parseJsonSafe<string[]>(pharmacy.statesServedJson, []);
  const shipping = parseJsonSafe<string[]>(pharmacy.shippingModesJson, []);
  const address = [pharmacy.street1, pharmacy.city, pharmacy.state, pharmacy.zip].filter(Boolean).join(", ");

  return (
    <div className="ws-stack">
      <PageHeader
        kicker={pharmacy.type}
        title={pharmacy.name}
        lede={pharmacy.legalName || pharmacy.description || "Network fulfillment partner."}
        actions={
          <div className="ws-head-actions">
            <StatusBadge tone={statusTone(pharmacy.status)}>{pharmacy.status}</StatusBadge>
            <Link className="btn btn-ghost" href="/admin/pharmacies">
              All pharmacies
            </Link>
            <Link className="btn btn-accent" href="/pharmacy">
              Open pharmacy workspace
            </Link>
          </div>
        }
      />

      <div className="ws-stat-grid">
        <StatLike label="Orders routed" value={pharmacy._count.orders} accent />
        <StatLike label="Locations" value={pharmacy._count.locations} />
        <StatLike label="Staff seats" value={pharmacy._count.users} />
        <StatLike
          label="Ship modes"
          value={[pharmacy.practiceShip ? "Practice" : null, pharmacy.patientShip ? "Patient" : null, pharmacy.coldChain ? "Cold" : null]
            .filter(Boolean)
            .join(" · ") || "—"}
        />
      </div>

      <div className="ws-split">
        <SectionCard title="Partner dossier">
          <div className="ws-kv">
            <div>
              <span>Legal name</span>
              <strong>{pharmacy.legalName || "—"}</strong>
            </div>
            <div>
              <span>Region</span>
              <strong>{pharmacy.region || "—"}</strong>
            </div>
            <div>
              <span>Hours</span>
              <strong>{pharmacy.hours || "—"}</strong>
            </div>
            <div>
              <span>SLA</span>
              <strong>{pharmacy.sla || "—"}</strong>
            </div>
            <div>
              <span>License</span>
              <strong>
                {[pharmacy.licenseState, pharmacy.licenseNumber].filter(Boolean).join(" ") || "—"}
              </strong>
            </div>
            <div>
              <span>NPI / DEA / NCPDP</span>
              <strong>
                {[pharmacy.npi && `NPI ${pharmacy.npi}`, pharmacy.deaNumber && `DEA ${pharmacy.deaNumber}`, pharmacy.ncpdpId && `NCPDP ${pharmacy.ncpdpId}`]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </strong>
            </div>
            <div>
              <span>Contact</span>
              <strong>
                {[pharmacy.contactName, pharmacy.contactEmail, pharmacy.phone].filter(Boolean).join(" · ") || "—"}
              </strong>
            </div>
            <div>
              <span>Website</span>
              <strong>
                {pharmacy.website ? (
                  <a href={pharmacy.website} target="_blank" rel="noreferrer">
                    {pharmacy.website}
                  </a>
                ) : (
                  "—"
                )}
              </strong>
            </div>
            <div>
              <span>HQ address</span>
              <strong>{address || "—"}</strong>
            </div>
            <div>
              <span>States served</span>
              <strong>{states.join(", ") || "—"}</strong>
            </div>
            <div>
              <span>Shipping modes</span>
              <strong>{shipping.join(" · ") || "—"}</strong>
            </div>
            <div>
              <span>ERP / integrations</span>
              <strong>{erp.join(" · ") || "—"}</strong>
            </div>
          </div>

          {pharmacy.description ? <p style={{ marginTop: 14 }}>{pharmacy.description}</p> : null}

          {specialties.length ? (
            <div className="ws-chip-row" style={{ marginTop: 14 }}>
              {specialties.map((s) => (
                <span key={s} className="ws-chip">
                  {s}
                </span>
              ))}
            </div>
          ) : null}

          {capabilities.length ? (
            <>
              <h3 style={{ margin: "18px 0 8px", fontSize: "1rem" }}>Capabilities</h3>
              <ul className="ws-steps">
                {capabilities.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          ) : null}

          {pharmacy.internalNotes ? (
            <>
              <h3 style={{ margin: "18px 0 8px", fontSize: "1rem" }}>Internal notes</h3>
              <p className="muted" style={{ whiteSpace: "pre-wrap" }}>
                {pharmacy.internalNotes}
              </p>
            </>
          ) : null}
        </SectionCard>

        <SectionCard title="Locations & staff">
          <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Locations</h3>
          <ul className="ws-steps">
            {pharmacy.locations.map((loc) => (
              <li key={loc.id}>
                <b>{loc.label}</b>
                {loc.isDefault ? " · default" : ""} — {[loc.street1, loc.city, loc.state, loc.zip].filter(Boolean).join(", ") || "No address"}
              </li>
            ))}
            {!pharmacy.locations.length ? <li className="muted">No locations yet.</li> : null}
          </ul>
          <h3 style={{ margin: "18px 0 8px", fontSize: "1rem" }}>Staff</h3>
          <ul className="ws-steps">
            {pharmacy.users.map((u) => (
              <li key={u.id}>
                <b>{u.name}</b> · {u.email}
              </li>
            ))}
            {!pharmacy.users.length ? <li className="muted">No pharmacy users linked.</li> : null}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Edit pharmacy partner" description="Update the full partner dossier used for routing and network display.">
        <PharmacyPartnerForm
          submitLabel="Save partner changes"
          defaults={{
            id: pharmacy.id,
            name: pharmacy.name,
            legalName: pharmacy.legalName,
            type: pharmacy.type,
            region: pharmacy.region,
            status: pharmacy.status,
            description: pharmacy.description,
            sla: pharmacy.sla,
            contactName: pharmacy.contactName,
            contactEmail: pharmacy.contactEmail,
            phone: pharmacy.phone,
            website: pharmacy.website,
            licenseNumber: pharmacy.licenseNumber,
            licenseState: pharmacy.licenseState,
            npi: pharmacy.npi,
            deaNumber: pharmacy.deaNumber,
            ncpdpId: pharmacy.ncpdpId,
            street1: pharmacy.street1,
            city: pharmacy.city,
            state: pharmacy.state,
            zip: pharmacy.zip,
            hours: pharmacy.hours,
            specialties,
            capabilities,
            erp,
            statesServed: states,
            shippingModes: shipping,
            coldChain: pharmacy.coldChain,
            patientShip: pharmacy.patientShip,
            practiceShip: pharmacy.practiceShip,
            internalNotes: pharmacy.internalNotes,
          }}
        />
      </SectionCard>

      <SectionCard title="Recent routed orders">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Practice</th>
                <th>Patient</th>
                <th>Status</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {pharmacy.orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/admin/orders/${o.id}`}>
                      <b>{o.invoiceNumber}</b>
                    </Link>
                  </td>
                  <td>{o.org.legalName}</td>
                  <td>{o.clinicalPatient?.fullName || "—"}</td>
                  <td>
                    <StatusBadge tone={statusTone(o.status)}>{o.status}</StatusBadge>
                  </td>
                  <td>{money(o.totalCents)}</td>
                </tr>
              ))}
              {!pharmacy.orders.length ? (
                <tr>
                  <td colSpan={5} className="muted">
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

function StatLike({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`ws-stat${accent ? " ws-stat-accent" : ""}`}>
      <span className="ws-stat-label">{label}</span>
      <strong className="ws-stat-value" style={{ fontSize: typeof value === "number" ? undefined : "1.15rem" }}>
        {value}
      </strong>
    </div>
  );
}
