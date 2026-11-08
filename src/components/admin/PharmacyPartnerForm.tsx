import { upsertPharmacy } from "@/lib/admin-actions";

export type PharmacyFormDefaults = {
  id?: string;
  name?: string;
  legalName?: string;
  type?: string;
  region?: string;
  status?: string;
  description?: string;
  sla?: string;
  contactName?: string;
  contactEmail?: string;
  phone?: string;
  website?: string;
  licenseNumber?: string;
  licenseState?: string;
  npi?: string;
  deaNumber?: string;
  ncpdpId?: string;
  street1?: string;
  city?: string;
  state?: string;
  zip?: string;
  hours?: string;
  specialties?: string[];
  capabilities?: string[];
  erp?: string[];
  statesServed?: string[];
  shippingModes?: string[];
  coldChain?: boolean;
  patientShip?: boolean;
  practiceShip?: boolean;
  internalNotes?: string;
};

function listValue(items?: string[]) {
  return (items || []).join("\n");
}

export function PharmacyPartnerForm({
  defaults,
  submitLabel = "Save pharmacy partner",
}: {
  defaults?: PharmacyFormDefaults;
  submitLabel?: string;
}) {
  const d = defaults || {};
  return (
    <form action={upsertPharmacy} className="ws-message-form pharmacy-partner-form">
      {d.id ? <input type="hidden" name="id" value={d.id} /> : null}

      <section className="escript-panel">
        <h3>Identity</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          How this partner appears in admin, practice network cards, and pharmacy routing.
        </p>
        <div className="ws-kv">
          <label>
            <span>Display name *</span>
            <input name="name" defaultValue={d.name || ""} required placeholder="Eventide / RxHere Network" />
          </label>
          <label>
            <span>Legal entity name</span>
            <input name="legalName" defaultValue={d.legalName || ""} placeholder="Eventide Wellness Collective LLC" />
          </label>
          <label>
            <span>Type</span>
            <select name="type" defaultValue={d.type || "Hybrid"}>
              <option value="503A">503A (patient-specific)</option>
              <option value="503B">503B (office-use / outsourcing)</option>
              <option value="Hybrid">Hybrid (503A + 503B)</option>
              <option value="PUO">PUO / specialty</option>
            </select>
          </label>
          <label>
            <span>Status</span>
            <select name="status" defaultValue={d.status || "online"}>
              <option value="online">online — accepting orders</option>
              <option value="maintenance">maintenance — temporary pause</option>
              <option value="offline">offline — do not route</option>
              <option value="onboarding">onboarding — not live yet</option>
            </select>
          </label>
          <label>
            <span>Region / coverage label</span>
            <input name="region" defaultValue={d.region || ""} placeholder="National routing · Southeast" />
          </label>
          <label>
            <span>Operating hours</span>
            <input name="hours" defaultValue={d.hours || ""} placeholder="Mon–Fri 8a–6p CT" />
          </label>
        </div>
        <label className="escript-field">
          <span>Public description</span>
          <textarea
            name="description"
            rows={3}
            defaultValue={d.description || ""}
            placeholder="What practices should know about this partner’s fulfillment lane."
          />
        </label>
      </section>

      <section className="escript-panel">
        <h3>Licensing & identifiers</h3>
        <div className="ws-kv">
          <label>
            <span>Pharmacy license #</span>
            <input name="licenseNumber" defaultValue={d.licenseNumber || ""} />
          </label>
          <label>
            <span>License state</span>
            <input name="licenseState" defaultValue={d.licenseState || ""} maxLength={2} placeholder="TX" style={{ maxWidth: 80 }} />
          </label>
          <label>
            <span>Organizational NPI</span>
            <input name="npi" defaultValue={d.npi || ""} placeholder="10 digits" />
          </label>
          <label>
            <span>DEA (if applicable)</span>
            <input name="deaNumber" defaultValue={d.deaNumber || ""} />
          </label>
          <label>
            <span>NCPDP ID</span>
            <input name="ncpdpId" defaultValue={d.ncpdpId || ""} />
          </label>
        </div>
      </section>

      <section className="escript-panel">
        <h3>Primary contact & HQ address</h3>
        <div className="ws-kv">
          <label>
            <span>Contact name</span>
            <input name="contactName" defaultValue={d.contactName || ""} placeholder="Ops lead" />
          </label>
          <label>
            <span>Contact email</span>
            <input name="contactEmail" type="email" defaultValue={d.contactEmail || ""} placeholder="ops@partner.com" />
          </label>
          <label>
            <span>Phone</span>
            <input name="phone" defaultValue={d.phone || ""} placeholder="+1 …" />
          </label>
          <label>
            <span>Website</span>
            <input name="website" defaultValue={d.website || ""} placeholder="https://" />
          </label>
          <label>
            <span>Street</span>
            <input name="street1" defaultValue={d.street1 || ""} />
          </label>
          <label>
            <span>City</span>
            <input name="city" defaultValue={d.city || ""} />
          </label>
          <label>
            <span>State</span>
            <input name="state" defaultValue={d.state || ""} maxLength={2} style={{ maxWidth: 80 }} />
          </label>
          <label>
            <span>ZIP</span>
            <input name="zip" defaultValue={d.zip || ""} style={{ maxWidth: 120 }} />
          </label>
        </div>
      </section>

      <section className="escript-panel">
        <h3>Fulfillment profile</h3>
        <div className="ws-kv">
          <label>
            <span>SLA promise</span>
            <input name="sla" defaultValue={d.sla || ""} placeholder="Ships within 1–3 business days after clearance" />
          </label>
        </div>
        <div className="row" style={{ gap: 18, flexWrap: "wrap", margin: "8px 0 4px" }}>
          <label className="row" style={{ gap: 8, alignItems: "center" }}>
            <input type="checkbox" name="coldChain" defaultChecked={Boolean(d.coldChain)} />
            Cold-chain capable
          </label>
          <label className="row" style={{ gap: 8, alignItems: "center" }}>
            <input type="checkbox" name="patientShip" defaultChecked={d.patientShip !== false} />
            Ships to patient
          </label>
          <label className="row" style={{ gap: 8, alignItems: "center" }}>
            <input type="checkbox" name="practiceShip" defaultChecked={d.practiceShip !== false} />
            Ships to practice
          </label>
        </div>
        <label className="escript-field">
          <span>Specialties (one per line or comma-separated)</span>
          <textarea name="specialties" rows={3} defaultValue={listValue(d.specialties)} placeholder={"GLP-1\nPeptides\nHormone"} />
        </label>
        <label className="escript-field">
          <span>Capabilities</span>
          <textarea
            name="capabilities"
            rows={4}
            defaultValue={listValue(d.capabilities)}
            placeholder={"Patient-specific 503A compounds\nOffice-use 503B\nStatus webhooks"}
          />
        </label>
        <label className="escript-field">
          <span>States / territories served</span>
          <textarea name="statesServed" rows={2} defaultValue={listValue(d.statesServed)} placeholder="TX, FL, CA, NY…" />
        </label>
        <label className="escript-field">
          <span>Shipping modes</span>
          <textarea name="shippingModes" rows={2} defaultValue={listValue(d.shippingModes)} placeholder={"2-day\nOvernight cold-chain\nGround"} />
        </label>
        <label className="escript-field">
          <span>ERP / integrations</span>
          <textarea name="erp" rows={2} defaultValue={listValue(d.erp)} placeholder={"RxHere Partner API\nEventide fulfillment"} />
        </label>
      </section>

      <section className="escript-panel">
        <h3>Internal notes</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Operator-only — not shown on the practice pharmacy network cards.
        </p>
        <label className="escript-field">
          <span>Notes</span>
          <textarea name="internalNotes" rows={3} defaultValue={d.internalNotes || ""} placeholder="Contract terms, escalation path, sandbox vs live keys…" />
        </label>
      </section>

      <button className="btn btn-accent" type="submit">
        {submitLabel}
      </button>
    </form>
  );
}
