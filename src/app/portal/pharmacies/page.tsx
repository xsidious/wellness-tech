import Link from "next/link";
import { PageHeader, SectionCard, StatusBadge } from "@/components/portal/Workspace";
import { ensurePharmacyNetwork } from "@/lib/ensure-pharmacies";
import { requireUser } from "@/lib/guard";
import { parseJsonSafe } from "@/lib/clinical-chart";
import { FULFILLMENT_FLOW } from "@/lib/pharmacy-network";

export default async function PharmaciesPage() {
  await requireUser();
  const pharmacies = await ensurePharmacyNetwork();

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Network"
        title="Pharmacy network"
        lede="Live 503A / 503B / Hybrid partners connected to Wellness Tech — the same fulfillment layer KIAN uses."
        actions={
          <Link className="btn btn-accent" href="/portal/orders">
            Track orders
          </Link>
        }
      />

      <div className="ws-flow">
        {FULFILLMENT_FLOW.map((item) => (
          <article key={item.step} className="ws-flow-step">
            <span className="ws-flow-num">{item.step}</span>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </div>

      <div className="ws-partner-grid">
        {pharmacies.map((partner) => {
          const specialties = parseJsonSafe<string[]>(partner.specialtiesJson, []);
          const capabilities = parseJsonSafe<string[]>(partner.capabilitiesJson, []);
          return (
            <article key={partner.id} className="ws-partner-card">
              <div className="ws-partner-top">
                <div>
                  <p className="kicker">{partner.type}</p>
                  <h2>{partner.name}</h2>
                  <p className="muted">{partner.region}</p>
                </div>
                <StatusBadge tone={partner.status === "online" ? "ok" : "warn"}>{partner.status}</StatusBadge>
              </div>
              <p>{partner.description}</p>
              <div className="ws-chip-row">
                {specialties.map((item) => (
                  <span key={item} className="ws-chip">
                    {item}
                  </span>
                ))}
              </div>
              <SectionCard title="Capabilities">
                <ul>
                  {capabilities.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="muted" style={{ marginTop: 8 }}>
                  SLA · {partner.sla || "—"}
                </p>
              </SectionCard>
            </article>
          );
        })}
      </div>
    </div>
  );
}
