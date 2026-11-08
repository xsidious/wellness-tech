import Link from "next/link";
import { PageHeader, SectionCard, StatusBadge, statusTone } from "@/components/portal/Workspace";
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

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Pharmacy"
        title="Profile & capabilities"
        lede="Public partner card practices see when routing compounds — keep contact, SLA, and specialties current."
        actions={
          <StatusBadge tone={statusTone(pharmacy.status)}>{pharmacy.status}</StatusBadge>
        }
      />
      {q.saved ? <p className="note">Pharmacy profile saved.</p> : null}

      <SectionCard title="Identity">
        <form action={updatePharmacyProfile} className="ws-message-form">
          <div className="ws-kv">
            <label>
              <span>Legal / display name</span>
              <input name="name" defaultValue={pharmacy.name} required />
            </label>
            <label>
              <span>Type</span>
              <select name="type" defaultValue={pharmacy.type}>
                <option value="503A">503A</option>
                <option value="503B">503B</option>
                <option value="Hybrid">Hybrid</option>
              </select>
            </label>
            <label>
              <span>Region</span>
              <input name="region" defaultValue={pharmacy.region} />
            </label>
            <label>
              <span>Status</span>
              <select name="status" defaultValue={pharmacy.status}>
                <option value="online">online</option>
                <option value="maintenance">maintenance</option>
                <option value="offline">offline</option>
              </select>
            </label>
            <label>
              <span>Contact email</span>
              <input name="contactEmail" type="email" defaultValue={pharmacy.contactEmail} />
            </label>
            <label>
              <span>SLA</span>
              <input name="sla" defaultValue={pharmacy.sla} placeholder="1–3 business days after clearance" />
            </label>
          </div>
          <label className="escript-field">
            <span>Description</span>
            <textarea name="description" rows={3} defaultValue={pharmacy.description} />
          </label>
          <label className="escript-field">
            <span>Specialties (comma or new line)</span>
            <textarea name="specialties" rows={3} defaultValue={scope.specialties.join("\n")} />
          </label>
          <label className="escript-field">
            <span>Capabilities</span>
            <textarea name="capabilities" rows={4} defaultValue={scope.capabilities.join("\n")} />
          </label>
          <label className="escript-field">
            <span>ERP / integrations</span>
            <textarea name="erp" rows={2} defaultValue={scope.erp.join("\n")} />
          </label>
          <button className="btn btn-accent" type="submit">
            Save pharmacy profile
          </button>
        </form>
      </SectionCard>
    </div>
  );
}
