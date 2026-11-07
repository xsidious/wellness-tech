import {
  flattenPayloadEntries,
  parseJsonSafe,
  type ClinicalChartPackage,
  type ClinicalSignature,
} from "@/lib/clinical-chart";
import { money } from "@/lib/money";

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="chart-field">
      <span>{label}</span>
      <strong>{String(value)}</strong>
    </div>
  );
}

function SignatureBlock({ entries }: { entries: ClinicalSignature[] }) {
  if (!entries.length) return <p className="muted">No signatures attached.</p>;
  return (
    <div className="sig-grid">
      {entries.map((entry, index) => (
        <figure key={`${entry.label}-${index}`} className="sig-card">
          <figcaption>
            <b>{entry.label}</b>
            {entry.printedName ? <span>{entry.printedName}</span> : null}
            {entry.signedAt ? <span>{new Date(entry.signedAt).toLocaleString()}</span> : null}
          </figcaption>
          {entry.kind === "image" && entry.value.startsWith("data:") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.value} alt={entry.label} className="sig-image" />
          ) : entry.kind === "list" ? (
            <ul className="sig-list">
              {parseJsonSafe<string[]>(entry.value, []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="sig-text">{entry.value}</p>
          )}
        </figure>
      ))}
    </div>
  );
}

export function ClinicalChartView({
  chartRaw,
  intakePayloadRaw,
  signaturesRaw,
  therapyRaw,
  patientJson,
  prescriberJson,
  shipToJson,
  lines,
  invoiceNumber,
  paymentStatus,
  totalCents,
  subtotalCents,
  shippingFeeCents,
  rxhereOrderId,
  partnerExternalRef,
  notes,
}: {
  chartRaw?: string;
  intakePayloadRaw?: string;
  signaturesRaw?: string;
  therapyRaw?: string;
  patientJson?: string;
  prescriberJson?: string;
  shipToJson?: string;
  lines: Array<{
    id: string;
    name: string;
    sku: string;
    qty: number;
    unitPriceCents: number;
    strength?: string | null;
    dosageForm?: string | null;
    sig?: string | null;
    productClass?: string | null;
  }>;
  invoiceNumber: string;
  paymentStatus: string;
  totalCents: number;
  subtotalCents: number;
  shippingFeeCents: number;
  rxhereOrderId?: string | null;
  partnerExternalRef?: string | null;
  notes?: string | null;
}) {
  const chart = parseJsonSafe<ClinicalChartPackage>(chartRaw, {});
  const intakePayload =
    chart.intake?.payload || parseJsonSafe<Record<string, unknown>>(intakePayloadRaw, {});
  const signatures =
    chart.signatures?.length
      ? chart.signatures
      : parseJsonSafe<ClinicalSignature[]>(signaturesRaw, []);
  const therapy = (chart.therapy || parseJsonSafe<Record<string, unknown>>(therapyRaw, {})) as Record<
    string,
    unknown
  >;
  const patientPacked = parseJsonSafe<Record<string, unknown>>(patientJson, {});
  const prescriber = parseJsonSafe<Record<string, unknown>>(prescriberJson, {});
  const shipTo = parseJsonSafe<Record<string, unknown>>(shipToJson, {});
  const flatIntake = flattenPayloadEntries(intakePayload);
  const therapyItems = Array.isArray(therapy.items) ? (therapy.items as Array<Record<string, unknown>>) : [];
  const provider = (therapy.provider as Record<string, unknown> | null) || null;

  return (
    <div className="chart-layout">
      <section className="chart-hero panel">
        <p className="kicker">Clinical package</p>
        <h1>{invoiceNumber}</h1>
        <p className="lede">
          Full intake, prescription, consents, practitioner signatures, and shipping — mirrored for pharmacy fulfillment.
        </p>
        <div className="chart-pills">
          <span className="pill">{paymentStatus}</span>
          {partnerExternalRef ? <span className="pill">KIAN {partnerExternalRef}</span> : null}
          {rxhereOrderId ? <span className="pill">Fulfillment {rxhereOrderId}</span> : null}
          {chart.intake?.status ? <span className="pill">Intake {String(chart.intake.status)}</span> : null}
          {signatures.length ? <span className="pill">{signatures.length} signature{signatures.length === 1 ? "" : "s"}</span> : null}
        </div>
      </section>

      <div className="chart-grid">
        <section className="panel">
          <h2>Patient</h2>
          <div className="chart-fields">
            <Field label="Name" value={chart.patient?.fullName || String(patientPacked.firstName || "") + " " + String(patientPacked.lastName || "")} />
            <Field label="Email" value={chart.patient?.email || String(patientPacked.email || "")} />
            <Field label="Phone" value={chart.patient?.phone || String(patientPacked.phone || "")} />
            <Field label="Date of birth" value={chart.patient?.dateOfBirth || String(patientPacked.dateOfBirth || "")} />
            <Field label="Gender" value={chart.patient?.gender || String(patientPacked.gender || "")} />
            <Field label="Allergies" value={chart.patient?.allergies || String(patientPacked.allergies || "")} />
            <Field label="Medications" value={chart.patient?.medications || ""} />
            <Field label="Conditions" value={chart.patient?.conditions || ""} />
            <Field
              label="Programs"
              value={(chart.intake?.programs || []).join(" · ") || null}
            />
            <Field label="Referred by" value={chart.intake?.referredBy || null} />
            <Field label="KIAN intake" value={chart.intake?.reference || chart.intake?.id || null} />
          </div>
        </section>

        <section className="panel">
          <h2>Ship to</h2>
          <div className="chart-fields">
            <Field label="Name" value={String(shipTo.name || "")} />
            <Field label="Street" value={[shipTo.street1, shipTo.street2].filter(Boolean).map(String).join(", ")} />
            <Field label="City" value={String(shipTo.city || "")} />
            <Field label="State" value={String(shipTo.state || "")} />
            <Field label="ZIP" value={String(shipTo.zip || "")} />
          </div>
          <h2 className="chart-subhead">Prescriber</h2>
          <div className="chart-fields">
            <Field
              label="Name"
              value={
                provider
                  ? String(provider.displayName || "")
                  : [prescriber.firstName, prescriber.lastName].filter(Boolean).map(String).join(" ")
              }
            />
            <Field label="Title" value={String(provider?.credentialsTitle || prescriber.title || "")} />
            <Field label="NPI" value={String(provider?.npi || prescriber.npiNumber || "")} />
            <Field label="Practice" value={String(provider?.legalName || prescriber.practiceName || "")} />
            <Field label="Phone" value={String(provider?.phone || prescriber.phone || "")} />
          </div>
        </section>
      </div>

      <section className="panel">
        <h2>Prescription</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Medication</th>
                <th>SKU</th>
                <th>Sig</th>
                <th>Qty</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <b>{line.name}</b>
                    <div className="muted">
                      {[line.dosageForm, line.strength].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td>{line.sku}</td>
                  <td>{line.sig || "As directed"}</td>
                  <td>{line.qty}</td>
                  <td>{money(line.unitPriceCents * line.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="chart-totals">
          Subtotal {money(subtotalCents)} · Shipping {money(shippingFeeCents)} · <b>Total {money(totalCents)}</b>
        </p>
        {therapy.notes ? <p className="note">Therapy notes: {String(therapy.notes)}</p> : null}
        {therapyItems.length ? (
          <div className="chart-therapy-items">
            <h3>Therapy proposal lines</h3>
            <ul>
              {therapyItems.map((item, i) => (
                <li key={i}>
                  {String(item.title || "Item")} × {String(item.quantity || 1)}
                  {item.unitPrice != null ? ` · $${Number(item.unitPrice).toFixed(2)}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h2>Consents & signatures</h2>
        <SignatureBlock entries={signatures} />
      </section>

      <section className="panel">
        <h2>Full intake answers</h2>
        <p className="muted">Everything captured on the KIAN / partner therapeutics form.</p>
        {flatIntake.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {flatIntake.map((row) => (
                  <tr key={row.key}>
                    <td className="chart-key">{row.key}</td>
                    <td>{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No intake payload on this order yet.</p>
        )}
      </section>

      {notes ? (
        <section className="panel">
          <h2>Order notes</h2>
          <pre className="chart-notes">{notes}</pre>
        </section>
      ) : null}
    </div>
  );
}
