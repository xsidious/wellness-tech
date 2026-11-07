import { PageHeader, SectionCard } from "@/components/portal/Workspace";
import { requireUser } from "@/lib/guard";
import { addPharmacyLocation } from "@/lib/pharmacy-actions";
import { prisma } from "@/lib/prisma";

export default async function PharmacyLocationsPage() {
  const user = await requireUser();
  const pharmacy = user.pharmacyId
    ? await prisma.pharmacy.findUnique({
        where: { id: user.pharmacyId },
        include: { locations: { orderBy: { createdAt: "asc" } } },
      })
    : null;

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Network"
        title="Locations"
        lede={pharmacy ? `${pharmacy.name} multi-location seats` : "Link a pharmacy record to this user to manage sites."}
      />

      {pharmacy ? (
        <>
          <SectionCard title="Sites">
            <ul>
              {pharmacy.locations.map((loc) => (
                <li key={loc.id}>
                  <b>{loc.label}</b>
                  {loc.isDefault ? " · default" : ""} — {[loc.street1, loc.city, loc.state, loc.zip].filter(Boolean).join(", ") || "No address"}
                </li>
              ))}
              {!pharmacy.locations.length ? <li className="muted">No locations yet.</li> : null}
            </ul>
          </SectionCard>
          <SectionCard title="Add location">
            <form action={addPharmacyLocation} className="ws-message-form">
              <label>
                Label
                <input name="label" defaultValue="Dispensing" required />
              </label>
              <label>
                Street
                <input name="street1" />
              </label>
              <div className="ws-kv">
                <label>
                  City
                  <input name="city" />
                </label>
                <label>
                  State
                  <input name="state" />
                </label>
                <label>
                  ZIP
                  <input name="zip" />
                </label>
              </div>
              <label className="row" style={{ gap: 8, alignItems: "center" }}>
                <input type="checkbox" name="isDefault" />
                Default location
              </label>
              <button className="btn btn-accent" type="submit">
                Save location
              </button>
            </form>
          </SectionCard>
        </>
      ) : (
        <SectionCard title="No pharmacy linked">
          <p className="muted">Ask an admin to set pharmacyId on this user after creating the Pharmacy network record.</p>
        </SectionCard>
      )}
    </div>
  );
}
