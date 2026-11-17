"use client";

import { useMemo, useState } from "react";
import { EscriptSigningPanel } from "@/components/escript/EscriptSigningPanel";
import { placeOrder } from "@/lib/actions";
import type { EscriptLineSnapshot, EscriptPatientSnapshot } from "@/lib/escript-shared";
import { money } from "@/lib/money";

function isNextRedirect(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
  );
}

function splitName(full: string) {
  const parts = String(full || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function addr(patient?: EscriptPatientSnapshot | null) {
  const a = (patient?.address || {}) as Record<string, string>;
  return {
    line1: a.line1 || a.street1 || "",
    line2: a.line2 || a.street2 || "",
    city: a.city || "",
    state: a.state || "",
    zip: a.zipCode || a.zip || a.postal_code || "",
  };
}

export function CheckoutForm({
  needsEscript = false,
  paymentsSandbox = true,
  canSign = true,
  gateMessage,
  signerLabel,
  npi,
  patient,
  lines = [],
  subtotalCents = 0,
  shippingCents = 0,
  defaultEmail = "",
}: {
  needsEscript?: boolean;
  paymentsSandbox?: boolean;
  canSign?: boolean;
  gateMessage?: string;
  signerLabel?: string;
  npi?: string;
  patient?: EscriptPatientSnapshot | null;
  lines?: EscriptLineSnapshot[];
  subtotalCents?: number;
  shippingCents?: number;
  defaultEmail?: string;
}) {
  const named = splitName(patient?.fullName || "");
  const a0 = addr(patient);
  const [last4, setLast4] = useState("");
  const [shipDestination, setShipDestination] = useState<"PRACTICE" | "PATIENT">("PATIENT");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const total = subtotalCents + shippingCents;

  const summaryLines = useMemo(
    () =>
      lines.map((line) => ({
        key: `${line.sku}-${line.patientInitials}-${line.qty}`,
        name: line.name,
        meta: [line.strength, line.dosageForm, line.qty > 1 ? `×${line.qty}` : ""].filter(Boolean).join(" · "),
        price: money(line.unitPriceCents * line.qty),
      })),
    [lines],
  );

  return (
    <form
      className="co"
      action={async (formData) => {
        setError("");
        setPending(true);
        formData.set("shipDestination", shipDestination);
        try {
          const result = await placeOrder(formData);
          if (result?.error) setError(result.error);
        } catch (err) {
          if (isNextRedirect(err)) throw err;
          setError(err instanceof Error ? err.message : "Could not place the order.");
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="co-layout">
        <div className="co-main">
          <section className="co-card">
            <header className="co-card-head">
              <p className="co-kicker">Patient for Eventide</p>
              <h2>Who receives this prescription?</h2>
              <p className="co-lede">
                VitaRelay creates or matches this patient on Eventide, then Eventide physicians issue and their pharmacies fill.
              </p>
            </header>
            <div className="co-grid-2">
              <label className="co-field">
                <span>First name</span>
                <input name="patientFirstName" defaultValue={named.first} required autoComplete="given-name" />
              </label>
              <label className="co-field">
                <span>Last name</span>
                <input name="patientLastName" defaultValue={named.last} required autoComplete="family-name" />
              </label>
              <label className="co-field">
                <span>Email</span>
                <input
                  name="patientEmail"
                  type="email"
                  defaultValue={patient?.email || defaultEmail}
                  required
                  autoComplete="email"
                />
              </label>
              <label className="co-field">
                <span>Mobile phone</span>
                <input
                  name="patientPhone"
                  type="tel"
                  defaultValue={patient?.phone || ""}
                  required
                  autoComplete="tel"
                  placeholder="555-0100"
                />
              </label>
              <label className="co-field">
                <span>Date of birth</span>
                <input name="patientDob" type="date" defaultValue={patient?.dateOfBirth || ""} required />
              </label>
              <label className="co-field">
                <span>Sex at birth</span>
                <select name="patientGender" defaultValue={patient?.gender || ""}>
                  <option value="">Prefer not to say</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="co-field co-span-2">
                <span>Allergies</span>
                <input name="patientAllergies" defaultValue={patient?.allergies || "NKDA"} placeholder="NKDA" />
              </label>
            </div>
          </section>

          <section className="co-card">
            <header className="co-card-head">
              <p className="co-kicker">Shipping</p>
              <h2>Where should Eventide ship?</h2>
            </header>
            <div className="co-ship-toggle" role="radiogroup" aria-label="Ship destination">
              <button
                type="button"
                className={`co-ship-opt${shipDestination === "PATIENT" ? " active" : ""}`}
                onClick={() => setShipDestination("PATIENT")}
              >
                <strong>Patient address</strong>
                <span>Direct-to-patient from Eventide pharmacy</span>
              </button>
              <button
                type="button"
                className={`co-ship-opt${shipDestination === "PRACTICE" ? " active" : ""}`}
                onClick={() => setShipDestination("PRACTICE")}
              >
                <strong>Practice office</strong>
                <span>Ship to your clinic for pickup</span>
              </button>
            </div>
            <input type="hidden" name="shipDestination" value={shipDestination} />
            <div className="co-grid-2" style={{ marginTop: 16 }}>
              <label className="co-field co-span-2">
                <span>Street address</span>
                <input name="shipLine1" defaultValue={a0.line1} required autoComplete="address-line1" />
              </label>
              <label className="co-field co-span-2">
                <span>Apt / suite</span>
                <input name="shipLine2" defaultValue={a0.line2} autoComplete="address-line2" />
              </label>
              <label className="co-field">
                <span>City</span>
                <input name="shipCity" defaultValue={a0.city} required autoComplete="address-level2" />
              </label>
              <label className="co-field">
                <span>State</span>
                <input
                  name="shipState"
                  defaultValue={a0.state}
                  required
                  maxLength={2}
                  placeholder="FL"
                  autoComplete="address-level1"
                  style={{ textTransform: "uppercase" }}
                />
              </label>
              <label className="co-field">
                <span>ZIP</span>
                <input name="shipZip" defaultValue={a0.zip} required autoComplete="postal-code" />
              </label>
            </div>
          </section>

          {needsEscript && canSign ? (
            <section className="co-card">
              <header className="co-card-head">
                <p className="co-kicker">Optional chart copy</p>
                <h2>Practice eScript</h2>
                <p className="co-lede">
                  Optional. Eventide’s physician issues the VitaRelay prescription either way — sign here only if you want a local chart copy.
                </p>
              </header>
              <EscriptSigningPanel
                patient={patient}
                lines={lines}
                canSign={canSign}
                gateMessage={gateMessage}
                signerLabel={signerLabel}
                npi={npi}
                showSubmit={false}
              />
            </section>
          ) : null}

          <section className="co-card">
            <header className="co-card-head">
              <p className="co-kicker">Payment</p>
              <h2>{paymentsSandbox ? "Authorize (sandbox)" : "Authorize payment"}</h2>
            </header>
            {paymentsSandbox ? (
              <>
                <label className="co-field">
                  <span>Card number</span>
                  <input
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="4242 4242 4242 4242 — only last 4 are stored"
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, "");
                      setLast4(digits.slice(-4));
                    }}
                  />
                </label>
                <input type="hidden" name="last4" value={last4} />
                <p className="co-hint">Sandbox mode — Eventide may still show awaiting practice payment on VitaRelay until billing is live.</p>
              </>
            ) : (
              <>
                <label className="co-field">
                  <span>Gateway payment nonce</span>
                  <input name="paymentNonce" placeholder="Opaque data from Accept.js / Stripe" required />
                </label>
                <label className="co-field">
                  <span>Card last four</span>
                  <input
                    name="last4"
                    inputMode="numeric"
                    maxLength={4}
                    value={last4}
                    onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                </label>
              </>
            )}
          </section>

          {error ? <p className="error">{error}</p> : null}

          <button className="btn btn-accent co-submit" type="submit" disabled={pending}>
            {pending ? "Sending to Eventide…" : "Place order with Eventide"}
          </button>
        </div>

        <aside className="co-aside">
          <div className="co-summary">
            <p className="co-kicker">Order summary</p>
            <h2>Ready for Eventide</h2>
            <ul className="co-summary-list">
              {summaryLines.map((line) => (
                <li key={line.key}>
                  <div>
                    <strong>{line.name}</strong>
                    {line.meta ? <span>{line.meta}</span> : null}
                  </div>
                  <em>{line.price}</em>
                </li>
              ))}
            </ul>
            <div className="co-totals">
              <div>
                <span>Subtotal</span>
                <strong>{money(subtotalCents)}</strong>
              </div>
              <div>
                <span>Shipping</span>
                <strong>{money(shippingCents)}</strong>
              </div>
              <div className="co-total">
                <span>Total</span>
                <strong>{money(total)}</strong>
              </div>
            </div>
            <p className="co-hint">
              After submit we upsert the patient in Wellness Tech, place the Rx under Eventide’s physician, and route to their pharmacy network.
            </p>
          </div>
        </aside>
      </div>
    </form>
  );
}
