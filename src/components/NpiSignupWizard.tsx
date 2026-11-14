"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { previewNpi, saveNpi } from "@/lib/actions";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME",
  "MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI",
  "SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
] as const;

type Step = 1 | 2;

export function NpiSignupWizard({ initialError = "" }: { initialError?: string }) {
  const [step, setStep] = useState<Step>(1);
  const [npi, setNpi] = useState("");
  const [license, setLicense] = useState("");
  const [licenseState, setLicenseState] = useState("");
  const [attest, setAttest] = useState(false);
  const [localError, setLocalError] = useState(initialError);
  const [matchedName, setMatchedName] = useState("");
  const [matchedSpecialty, setMatchedSpecialty] = useState("");
  const [licensesHint, setLicensesHint] = useState("");
  const [lookingUp, startLookup] = useTransition();

  const [serverState, action, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const result = await saveNpi(formData);
      return result || null;
    },
    null,
  );

  const digits = useMemo(() => npi.replace(/\D/g, "").slice(0, 10), [npi]);
  const error = serverState?.error || localError;

  function goToLicense(e: React.FormEvent) {
    e.preventDefault();
    setLocalError("");
    if (digits.length !== 10) {
      setLocalError("Enter a valid 10-digit NPI (numbers only).");
      return;
    }
    startLookup(async () => {
      const fd = new FormData();
      fd.set("npi", digits);
      const preview = await previewNpi(fd);
      if (preview.error) {
        setLocalError(preview.error);
        setMatchedName("");
        setMatchedSpecialty("");
        setLicensesHint("");
        return;
      }
      setMatchedName(preview.displayName || "");
      setMatchedSpecialty(preview.specialty || "");
      setLicensesHint(preview.licensesHint || "");
      if (preview.enumerationType === "NPI-2") {
        setLocalError(
          "That NPI is an organization (Type 2). Enter the prescribing clinician’s individual Type 1 NPI.",
        );
        return;
      }
      // Prefill state if CMS only lists one state.
      const states = (preview.licensesHint || "")
        .split("·")
        .map((s) => s.trim().slice(0, 2))
        .filter((s) => /^[A-Z]{2}$/.test(s));
      const unique = [...new Set(states)];
      if (unique.length === 1 && !licenseState) setLicenseState(unique[0]);
      setStep(2);
    });
  }

  return (
    <div className="auth-card signup-wizard">
      <ol className="signup-steps" aria-label="Signup progress">
        <li className="signup-step is-done">
          <span className="signup-step-num" aria-hidden>
            ✓
          </span>
          <span>Account</span>
        </li>
        <li className={`signup-step ${step === 1 ? "is-active" : "is-done"}`}>
          <span className="signup-step-num" aria-hidden>
            {step > 1 ? "✓" : "2"}
          </span>
          <span>NPI</span>
        </li>
        <li className={`signup-step ${step === 2 ? "is-active" : ""}`}>
          <span className="signup-step-num" aria-hidden>
            3
          </span>
          <span>License</span>
        </li>
      </ol>

      {step === 1 ? (
        <form className="auth-form" onSubmit={goToLicense}>
          <p className="auth-step-note">
            We look up your <strong>individual Type 1 NPI</strong> in the CMS NPPES registry (live). Use digits only —
            this is not your state license number.
          </p>
          <label className="auth-field">
            <span>National Provider Identifier (NPI)</span>
            <input
              name="npi_display"
              inputMode="numeric"
              autoComplete="off"
              placeholder="10-digit NPI"
              value={npi}
              onChange={(e) => setNpi(e.target.value.replace(/[^\d]/g, "").slice(0, 10))}
              required
              autoFocus
            />
            <span className="signup-hint">{digits.length}/10 digits</span>
          </label>
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="btn btn-accent auth-submit" type="submit" disabled={lookingUp}>
            {lookingUp ? "Checking CMS registry…" : "Look up NPI"}
          </button>
          <p className="auth-meta">
            <Link href="/portal">Skip for now · go to portal</Link>
            {" · "}
            <a href="https://npiregistry.cms.hhs.gov/" target="_blank" rel="noreferrer">
              Find NPI on CMS
            </a>
          </p>
        </form>
      ) : (
        <form className="auth-form" action={action}>
          <input type="hidden" name="npi" value={digits} />
          <div className="signup-match note" role="status">
            <p>
              <strong>CMS match:</strong> {matchedName || "Provider found"}
            </p>
            {matchedSpecialty ? <p className="muted">Specialty: {matchedSpecialty}</p> : null}
            {licensesHint ? <p className="muted">Licenses on file: {licensesHint}</p> : null}
            <p className="muted">
              Next we compare your state license to what CMS has on this NPI (when CMS lists one for that state).
            </p>
          </div>
          <div className="signup-two-col">
            <label className="auth-field">
              <span>License state</span>
              <select
                name="licenseState"
                required
                value={licenseState}
                onChange={(e) => setLicenseState(e.target.value)}
              >
                <option value="">Select…</option>
                {US_STATES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </label>
            <label className="auth-field">
              <span>State license number</span>
              <input
                name="license"
                required
                minLength={3}
                value={license}
                onChange={(e) => setLicense(e.target.value)}
                placeholder="As printed on your license"
                autoFocus
              />
            </label>
          </div>
          <label className="signup-attest">
            <input
              type="checkbox"
              name="attest"
              checked={attest}
              onChange={(e) => setAttest(e.target.checked)}
            />
            <span>I attest this state license is active and in good standing.</span>
          </label>
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="signup-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setLocalError("");
                setStep(1);
              }}
            >
              Back
            </button>
            <button className="btn btn-accent auth-submit" disabled={pending || !attest}>
              {pending ? "Verifying…" : "Finish verification"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
