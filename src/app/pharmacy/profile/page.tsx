import Link from "next/link";
import { PageHeader, SectionCard, StatusBadge, statusTone } from "@/components/portal/Workspace";
import { parseJsonSafe } from "@/lib/clinical-chart";
import { requireUser } from "@/lib/guard";
import { updatePharmacyProfile } from "@/lib/pharmacy-actions";
import { resolvePharmacyScope } from "@/lib/pharmacy-scope";

export default async function PharmacyProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireUser();
  const scope = await resolvePharmacyScope(user);
  const pharmacy = scope.pharmacy;
  const q = await searchParams;

  if (!pharmacy) {
    return (
      <div className="ws-stack">
        <PageHeader kicker="Pharmacy" title="Profile" lede="No pharmacy record linked to this login." />
        <SectionCard title="Link required">
          <p className="muted">
            An admin must create the pharmacy under <Link href="/admin/pharmacies">Admin → Pharmacies</Link> and attach
            this user via <code>pharmacyId</code>.
          </p>
        </SectionCard>
      </div>
    );
  }

  const specialties = parseJsonSafe<string[]>(pharmacy.specialtiesJson, []);
  const capabilities = parseJsonSafe<string[]>(pharmacy.capabilitiesJson, []);
  const erp = parseJsonSafe<string[]>(pharmacy.erpJson, []);
  const states = parseJsonSafe<string[]>(pharmacy.statesServedJson, []);
  const shipping = parseJsonSafe<string[]>(pharmacy.shippingModesJson, []);

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Pharmacy"
        title="Profile & capabilities"
        lede="Keep licensing, contacts, ship modes, and specialties current for routing and practice visibility."
        actions={<StatusBadge tone={statusTone(pharmacy.status)}>{pharmacy.status}</StatusBadge>}
      />
      {q.saved ? <p className="note">Pharmacy profile saved.</p> : null}

      <SectionCard title="Public dossier preview">
        <div className="ws-kv">
          <div>
            <span>Legal name</span>
            <strong>{pharmacy.legalName || "—"}</strong>
          </div>
          <div>
            <span>License</span>
            <strong>{[pharmacy.licenseState, pharmacy.licenseNumber].filter(Boolean).join(" ") || "—"}</strong>
          </div>
          <div>
            <span>NPI / NCPDP</span>
            <strong>
              {[pharmacy.npi && `NPI ${pharmacy.npi}`, pharmacy.ncpdpId && `NCPDP ${pharmacy.ncpdpId}`].filter(Boolean).join(" · ") ||
                "—"}
            </strong>
          </div>
          <div>
            <span>Contact</span>
            <strong>{[pharmacy.contactName, pharmacy.contactEmail, pharmacy.phone].filter(Boolean).join(" · ") || "—"}</strong>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Edit profile">
        <form action={updatePharmacyProfile} className="ws-message-form">
          <div className="ws-kv">
            <label>
              <span>Display name</span>
              <input name="name" defaultValue={pharmacy.name} required />
            </label>
            <label>
              <span>Legal name</span>
              <input name="legalName" defaultValue={pharmacy.legalName} />
            </label>
            <label>
              <span>Type</span>
              <select name="type" defaultValue={pharmacy.type}>
                <option value="503A">503A</option>
                <option value="503B">503B</option>
                <option value="Hybrid">Hybrid</option>
                <option value="PUO">PUO</option>
              </select>
            </label>
            <label>
              <span>Status</span>
              <select name="status" defaultValue={pharmacy.status}>
                <option value="online">online</option>
                <option value="maintenance">maintenance</option>
                <option value="offline">offline</option>
                <option value="onboarding">onboarding</option>
              </select>
            </label>
            <label>
              <span>Region</span>
              <input name="region" defaultValue={pharmacy.region} />
            </label>
            <label>
              <span>Hours</span>
              <input name="hours" defaultValue={pharmacy.hours} />
            </label>
            <label>
              <span>Contact name</span>
              <input name="contactName" defaultValue={pharmacy.contactName} />
            </label>
            <label>
              <span>Contact email</span>
              <input name="contactEmail" type="email" defaultValue={pharmacy.contactEmail} />
            </label>
            <label>
              <span>Phone</span>
              <input name="phone" defaultValue={pharmacy.phone} />
            </label>
            <label>
              <span>Website</span>
              <input name="website" defaultValue={pharmacy.website} />
            </label>
            <label>
              <span>License #</span>
              <input name="licenseNumber" defaultValue={pharmacy.licenseNumber} />
            </label>
            <label>
              <span>License state</span>
              <input name="licenseState" defaultValue={pharmacy.licenseState} maxLength={2} />
            </label>
            <label>
              <span>NPI</span>
              <input name="npi" defaultValue={pharmacy.npi} />
            </label>
            <label>
              <span>DEA</span>
              <input name="deaNumber" defaultValue={pharmacy.deaNumber} />
            </label>
            <label>
              <span>NCPDP</span>
              <input name="ncpdpId" defaultValue={pharmacy.ncpdpId} />
            </label>
            <label>
              <span>SLA</span>
              <input name="sla" defaultValue={pharmacy.sla} />
            </label>
            <label>
              <span>Street</span>
              <input name="street1" defaultValue={pharmacy.street1} />
            </label>
            <label>
              <span>City</span>
              <input name="city" defaultValue={pharmacy.city} />
            </label>
            <label>
              <span>State</span>
              <input name="state" defaultValue={pharmacy.state} maxLength={2} />
            </label>
            <label>
              <span>ZIP</span>
              <input name="zip" defaultValue={pharmacy.zip} />
            </label>
          </div>

          <div className="row" style={{ gap: 18, flexWrap: "wrap" }}>
            <label className="row" style={{ gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="coldChain" defaultChecked={pharmacy.coldChain} />
              Cold-chain
            </label>
            <label className="row" style={{ gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="patientShip" defaultChecked={pharmacy.patientShip} />
              Patient ship
            </label>
            <label className="row" style={{ gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="practiceShip" defaultChecked={pharmacy.practiceShip} />
              Practice ship
            </label>
          </div>

          <label className="escript-field">
            <span>Description</span>
            <textarea name="description" rows={3} defaultValue={pharmacy.description} />
          </label>
          <label className="escript-field">
            <span>Specialties</span>
            <textarea name="specialties" rows={3} defaultValue={specialties.join("\n")} />
          </label>
          <label className="escript-field">
            <span>Capabilities</span>
            <textarea name="capabilities" rows={4} defaultValue={capabilities.join("\n")} />
          </label>
          <label className="escript-field">
            <span>States served</span>
            <textarea name="statesServed" rows={2} defaultValue={states.join("\n")} />
          </label>
          <label className="escript-field">
            <span>Shipping modes</span>
            <textarea name="shippingModes" rows={2} defaultValue={shipping.join("\n")} />
          </label>
          <label className="escript-field">
            <span>ERP / integrations</span>
            <textarea name="erp" rows={2} defaultValue={erp.join("\n")} />
          </label>
          <button className="btn btn-accent" type="submit">
            Save pharmacy profile
          </button>
        </form>
      </SectionCard>
    </div>
  );
}
