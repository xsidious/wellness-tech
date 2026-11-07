"use client";

import { useState, type ReactNode } from "react";
import { SignaturePad } from "@/components/escript/SignaturePad";
import {
  ESCRIPT_ATTESTATION_TEXT,
  ESCRIPT_ATTESTATION_VERSION,
  type EscriptLineSnapshot,
  type EscriptPatientSnapshot,
  formatAddress,
} from "@/lib/escript";

type Props = {
  patient?: EscriptPatientSnapshot | null;
  lines: EscriptLineSnapshot[];
  defaultDirections?: string;
  submitLabel?: string;
  canSign: boolean;
  gateMessage?: string;
  signerLabel?: string;
  npi?: string;
  /** When set, wraps fields in a dedicated form. Omit when embedding inside a parent form. */
  formAction?: (formData: FormData) => void | Promise<void>;
  hiddenFields?: Record<string, string>;
  showSubmit?: boolean;
  footer?: ReactNode;
};

function ReviewBlocks({
  patient,
  lines,
  canSign,
  gateMessage,
  signerLabel,
  npi,
}: Pick<Props, "patient" | "lines" | "canSign" | "gateMessage" | "signerLabel" | "npi">) {
  return (
    <>
      <div className="escript-sign-hero">
        <p className="kicker">Electronic prescription</p>
        <h2>Review & sign</h2>
        <p className="muted">
          Confirm patient, medication lines, and directions. Your signature creates an immutable audit record (
          {ESCRIPT_ATTESTATION_VERSION}).
        </p>
      </div>

      <div className="escript-sign-grid">
        <section className="escript-panel">
          <h3>Patient</h3>
          {patient?.fullName ? (
            <dl className="escript-dl">
              <div>
                <dt>Name</dt>
                <dd>{patient.fullName}</dd>
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
          ) : (
            <p className="muted">Office-use / no linked patient chart — patient initials on each line still apply.</p>
          )}
        </section>

        <section className="escript-panel">
          <h3>Prescriber</h3>
          <dl className="escript-dl">
            <div>
              <dt>Signing as</dt>
              <dd>{signerLabel || "—"}</dd>
            </div>
            <div>
              <dt>NPI</dt>
              <dd>{npi || "—"}</dd>
            </div>
          </dl>
          {!canSign && gateMessage ? <p className="escript-gate">{gateMessage}</p> : null}
        </section>
      </div>

      <section className="escript-panel">
        <h3>Prescription lines</h3>
        <div className="table-wrap">
          <table className="table escript-lines">
            <thead>
              <tr>
                <th>Medication</th>
                <th>Class</th>
                <th>Qty</th>
                <th>Sig / directions</th>
                <th>Days</th>
                <th>Patient</th>
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
                    No lines.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export function EscriptSigningPanel({
  patient,
  lines,
  defaultDirections = "As directed by prescribing clinician.",
  submitLabel = "Sign eScript & release",
  canSign,
  gateMessage,
  signerLabel,
  npi,
  formAction,
  hiddenFields,
  showSubmit = true,
  footer,
}: Props) {
  const [accepted, setAccepted] = useState(false);

  const fields = (
    <div className="escript-sign-form">
      {hiddenFields
        ? Object.entries(hiddenFields).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))
        : null}

      <label className="escript-field">
        <span>Overall directions</span>
        <textarea name="directions" rows={2} defaultValue={defaultDirections} disabled={!canSign} />
      </label>

      <label className="escript-field">
        <span>License state (2-letter)</span>
        <input name="licenseState" maxLength={2} placeholder="e.g. VA" disabled={!canSign} style={{ maxWidth: 120 }} />
      </label>

      <SignaturePad label="Prescriber signature" height={168} />

      <label className={`escript-attest${accepted ? " on" : ""}`}>
        <input
          type="checkbox"
          name="attestationAccepted"
          value="1"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          disabled={!canSign}
          required={canSign}
        />
        <span>
          <strong>Prescriber attestation</strong>
          <em>{ESCRIPT_ATTESTATION_TEXT}</em>
        </span>
      </label>

      {showSubmit ? (
        <button className="btn btn-accent escript-submit" type="submit" disabled={!canSign || !accepted}>
          {submitLabel}
        </button>
      ) : null}
      {footer}
    </div>
  );

  const body = (
    <div className="escript-sign">
      <ReviewBlocks
        patient={patient}
        lines={lines}
        canSign={canSign}
        gateMessage={gateMessage}
        signerLabel={signerLabel}
        npi={npi}
      />
      {formAction ? <form action={formAction}>{fields}</form> : fields}
    </div>
  );

  return body;
}
