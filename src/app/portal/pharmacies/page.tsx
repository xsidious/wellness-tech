import Link from "next/link";
import { PageHeader, SectionCard, StatusBadge } from "@/components/portal/Workspace";
import { ensurePharmacyNetwork } from "@/lib/ensure-pharmacies";
import { requireUser } from "@/lib/guard";
import { parseJsonSafe } from "@/lib/clinical-chart";
import { FULFILLMENT_FLOW } from "@/lib/pharmacy-network";
import { prisma } from "@/lib/prisma";

export default async function PharmaciesPage() {
  await requireUser();
  await ensurePharmacyNetwork();
  const pharmacies = await prisma.pharmacy.findMany({
    where: { status: { in: ["online", "maintenance"] } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Network"
        title="Pharmacy network"
        lede="Live 503A / 503B / Hybrid partners connected to Wellness Tech — licensing, ship modes, and SLAs for your compounds."
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
          const states = parseJsonSafe<string[]>(partner.statesServedJson, []);
          const shipping = parseJsonSafe<string[]>(partner.shippingModesJson, []);
          const address = [partner.street1, partner.city, partner.state, partner.zip].filter(Boolean).join(", ");
          return (
            <article key={partner.id} className="ws-partner-card">
              <div className="ws-partner-top">
                <div>
                  <p className="kicker">{partner.type}</p>
                  <h2>{partner.name}</h2>
                  <p className="muted">{partner.legalName || partner.region || "Network partner"}</p>
                </div>
                <StatusBadge tone={partner.status === "online" ? "ok" : "warn"}>{partner.status}</StatusBadge>
              </div>
              {partner.description ? <p>{partner.description}</p> : null}
              <div className="ws-chip-row">
                {specialties.map((item) => (
                  <span key={item} className="ws-chip">
                    {item}
                  </span>
                ))}
              </div>
              <div className="ws-partner-cols">
                <div>
                  <h3>Capabilities</h3>
                  <ul>
                    {capabilities.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                    {!capabilities.length ? <li className="muted">See SLA below.</li> : null}
                  </ul>
                </div>
                <div>
                  <h3>Operations</h3>
                  <ul>
                    <li>SLA · {partner.sla || "—"}</li>
                    <li>Hours · {partner.hours || "—"}</li>
                    <li>
                      Ship ·{" "}
                      {[partner.practiceShip ? "practice" : null, partner.patientShip ? "patient" : null, partner.coldChain ? "cold-chain" : null]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </li>
                    {shipping.length ? <li>Modes · {shipping.join(", ")}</li> : null}
                    {states.length ? <li>States · {states.slice(0, 8).join(", ")}{states.length > 8 ? "…" : ""}</li> : null}
                    {address ? <li>HQ · {address}</li> : null}
                    {partner.contactEmail || partner.phone ? (
                      <li>Contact · {[partner.contactEmail, partner.phone].filter(Boolean).join(" · ")}</li>
                    ) : null}
                  </ul>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {!pharmacies.length ? (
        <SectionCard title="No live partners">
          <p className="muted">Admin has not published an online pharmacy partner yet.</p>
        </SectionCard>
      ) : null}
    </div>
  );
}
