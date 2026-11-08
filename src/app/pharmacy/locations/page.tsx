import { PageHeader, SectionCard, StatusBadge } from "@/components/portal/Workspace";
import { requireUser } from "@/lib/guard";
import { addPharmacyLocation, updatePharmacyLocation } from "@/lib/pharmacy-actions";
import { resolvePharmacyScope } from "@/lib/pharmacy-scope";

export default async function PharmacyLocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireUser();
  const scope = await resolvePharmacyScope(user);
  const pharmacy = scope.pharmacy;
  const q = await searchParams;

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Pharmacy"
        title="Locations"
        lede={pharmacy ? `Dispensing sites for ${pharmacy.name}.` : "Link a pharmacy record to manage sites."}
      />
      {q.saved ? <p className="note">Location saved.</p> : null}

      {pharmacy ? (
        <>
          <SectionCard title={`${pharmacy.locations.length} sites`} flush>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Address</th>
                    <th>Default</th>
                    <th>Update</th>
                  </tr>
                </thead>
                <tbody>
                  {pharmacy.locations.map((loc) => (
                    <tr key={loc.id}>
                      <td>
                        <b>{loc.label}</b>
                      </td>
                      <td className="muted">
                        {[loc.street1, loc.city, loc.state, loc.zip].filter(Boolean).join(", ") || "No address"}
                      </td>
                      <td>{loc.isDefault ? <StatusBadge tone="ok">Default</StatusBadge> : "—"}</td>
                      <td>
                        <form action={updatePharmacyLocation} className="ws-message-form" style={{ gap: 8 }}>
                          <input type="hidden" name="id" value={loc.id} />
                          <input name="label" defaultValue={loc.label} required />
                          <input name="street1" defaultValue={loc.street1} placeholder="Street" />
                          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                            <input name="city" defaultValue={loc.city} placeholder="City" style={{ width: 120 }} />
                            <input name="state" defaultValue={loc.state} placeholder="ST" style={{ width: 64 }} />
                            <input name="zip" defaultValue={loc.zip} placeholder="ZIP" style={{ width: 90 }} />
                          </div>
                          <label className="row" style={{ gap: 8, alignItems: "center" }}>
                            <input type="checkbox" name="isDefault" defaultChecked={loc.isDefault} />
                            Default
                          </label>
                          <button className="btn btn-ghost" type="submit">
                            Save
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                  {!pharmacy.locations.length ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        No locations yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Add location">
            <form action={addPharmacyLocation} className="ws-message-form">
              <div className="ws-kv">
                <label>
                  <span>Label</span>
                  <input name="label" defaultValue="Dispensing" required />
                </label>
                <label>
                  <span>Street</span>
                  <input name="street1" />
                </label>
                <label>
                  <span>City</span>
                  <input name="city" />
                </label>
                <label>
                  <span>State</span>
                  <input name="state" />
                </label>
                <label>
                  <span>ZIP</span>
                  <input name="zip" />
                </label>
              </div>
              <label className="row" style={{ gap: 8, alignItems: "center" }}>
                <input type="checkbox" name="isDefault" />
                Default location
              </label>
              <button className="btn btn-accent" type="submit">
                Add location
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
