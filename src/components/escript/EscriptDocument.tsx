import Link from "next/link";
import { StatusBadge, statusTone } from "@/components/portal/Workspace";
import {
  formatAddress,
  parseLinesSnapshot,
  parsePatientSnapshot,
} from "@/lib/escript-shared";

export type EscriptDocumentModel = {
  id: string;
  status: string;
  displayName: string;
  npi: string;
  signerEmail?: string | null;
  licenseState?: string | null;
  licenseNumber?: string | null;
  deaNumber?: string | null;
  directions: string;
  attestationText?: string | null;
  attestationVersion?: string | null;
  signatureDataUrl?: string | null;
  signedAt?: Date | string | null;
  signedIp?: string | null;
  signedUserAgent?: string | null;
  contentHash?: string | null;
  version?: number | null;
  patientSnapshotJson?: string | null;
  linesSnapshotJson?: string | null;
  order?: {
    id: string;
    invoiceNumber: string;
    createdAt?: Date | string;
  } | null;
  clinicalPatient?: { id: string; fullName: string } | null;
};

export function EscriptDocument({
  script,
  printHref,
  orderHref,
  patientHref,
}: {
  script: EscriptDocumentModel;
  printHref?: string;
  orderHref?: string;
  patientHref?: string;
}) {
  const patient = parsePatientSnapshot(script.patientSnapshotJson);
  const lines = parseLinesSnapshot(script.linesSnapshotJson);
  const signedAt =
    script.signedAt instanceof Date
      ? script.signedAt
      : script.signedAt
        ? new Date(script.signedAt)
        : null;

  return (
    <article className="escript-doc">
      <header className="escript-doc-head">
        <div>
          <p className="kicker">Electronic prescription record</p>
          <h2>{script.order?.invoiceNumber || "eScript"}</h2>
          <p className="muted">
            Version {script.version || 1}
            {script.attestationVersion ? ` · ${script.attestationVersion}` : ""}
          </p>
        </div>
        <div className="escript-doc-actions">
          <StatusBadge tone={statusTone(script.status)}>{script.status}</StatusBadge>
          {printHref ? (
            <Link className="btn btn-ghost" href={printHref} target="_blank">
              Print / PDF
            </Link>
          ) : null}
          {orderHref ? (
            <Link className="btn btn-ghost" href={orderHref}>
              Order
            </Link>
          ) : null}
        </div>
      </header>

      <div className="escript-doc-grid">
        <section>
          <h3>Patient</h3>
          <dl className="escript-dl">
            <div>
              <dt>Name</dt>
              <dd>
                {patientHref && script.clinicalPatient ? (
                  <Link href={patientHref}>{patient.fullName || script.clinicalPatient.fullName}</Link>
                ) : (
                  patient.fullName || "—"
                )}
              </dd>
            </div>
            <div>
              <dt>DOB</dt>
              <dd>{patient.dateOfBirth || "—"}</dd>
            </div>
            <div>
              <dt>Contact</dt>
              <dd>
                {patient.email || "—"}
                {patient.phone ? ` · ${patient.phone}` : ""}
              </dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{formatAddress(patient.address || {})}</dd>
            </div>
            <div>
              <dt>Allergies</dt>
              <dd>{patient.allergies || "None documented"}</dd>
            </div>
          </dl>
        </section>

        <section>
          <h3>Prescriber</h3>
          <dl className="escript-dl">
            <div>
              <dt>Name</dt>
              <dd>{script.displayName || "—"}</dd>
            </div>
            <div>
              <dt>NPI</dt>
              <dd>{script.npi || "—"}</dd>
            </div>
            <div>
              <dt>License</dt>
              <dd>
                {[script.licenseState, script.licenseNumber].filter(Boolean).join(" ") || "—"}
              </dd>
            </div>
            <div>
              <dt>DEA</dt>
              <dd>{script.deaNumber || "—"}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{script.signerEmail || "—"}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="escript-doc-section">
        <h3>Medications</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Medication</th>
                <th>Class</th>
                <th>Qty</th>
                <th>Sig</th>
                <th>Days</th>
                <th>Initials</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={`${line.sku}-${idx}`}>
                  <td>
                    <b>{line.name}</b>
                    <div className="muted">
                      {[line.strength, line.size, line.dosageForm].filter(Boolean).join(" · ") || line.sku}
                    </div>
                  </td>
                  <td>{line.productClass}</td>
                  <td>{line.qty}</td>
                  <td>{line.sig || "—"}</td>
                  <td>{line.daysSupply || "—"}</td>
                  <td>{line.patientInitials || "—"}</td>
                </tr>
              ))}
              {!lines.length ? (
                <tr>
                  <td colSpan={6} className="muted">
                    Snapshot unavailable — open the linked order for live lines.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="escript-directions">
          <b>Directions:</b> {script.directions || "—"}
        </p>
      </section>

      <section className="escript-doc-section escript-sig-block">
        <h3>Signature & attestation</h3>
        {script.signatureDataUrl?.startsWith("data:image") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="escript-sig-img" src={script.signatureDataUrl} alt={`Signature of ${script.displayName}`} />
        ) : (
          <p className="muted">No signature image on file.</p>
        )}
        {script.attestationText ? <blockquote className="escript-attest-quote">{script.attestationText}</blockquote> : null}
        <dl className="escript-dl escript-audit">
          <div>
            <dt>Signed</dt>
            <dd>{signedAt ? signedAt.toLocaleString() : "—"}</dd>
          </div>
          <div>
            <dt>IP</dt>
            <dd>{script.signedIp || "—"}</dd>
          </div>
          <div>
            <dt>Content hash</dt>
            <dd className="escript-hash">{script.contentHash || "—"}</dd>
          </div>
        </dl>
      </section>
    </article>
  );
}
