"use client";

import { useState } from "react";
import { EscriptSigningPanel } from "@/components/escript/EscriptSigningPanel";
import { placeOrder } from "@/lib/actions";
import type { EscriptLineSnapshot, EscriptPatientSnapshot } from "@/lib/escript";

export function CheckoutForm({
  needsEscript = false,
  paymentsSandbox = true,
  canSign = true,
  gateMessage,
  signerLabel,
  npi,
  patient,
  lines = [],
}: {
  needsEscript?: boolean;
  paymentsSandbox?: boolean;
  canSign?: boolean;
  gateMessage?: string;
  signerLabel?: string;
  npi?: string;
  patient?: EscriptPatientSnapshot | null;
  lines?: EscriptLineSnapshot[];
}) {
  const [last4, setLast4] = useState("");
  const [shipDestination, setShipDestination] = useState<"PRACTICE" | "PATIENT">("PRACTICE");
  const [error, setError] = useState("");

  return (
    <form
      className="form escript-checkout"
      action={async (formData) => {
        formData.set("shipDestination", shipDestination);
        const result = await placeOrder(formData);
        if (result?.error) setError(result.error);
      }}
    >
      <fieldset className="stack" style={{ border: "none", padding: 0, margin: "0 0 18px" }}>
        <legend className="kicker">Ship destination</legend>
        <label className="row" style={{ gap: 8, alignItems: "center" }}>
          <input
            type="radio"
            name="shipDestinationRadio"
            value="PRACTICE"
            checked={shipDestination === "PRACTICE"}
            onChange={() => setShipDestination("PRACTICE")}
          />
          Ship to practice
        </label>
        <label className="row" style={{ gap: 8, alignItems: "center" }}>
          <input
            type="radio"
            name="shipDestinationRadio"
            value="PATIENT"
            checked={shipDestination === "PATIENT"}
            onChange={() => setShipDestination("PATIENT")}
          />
          Ship to patient
        </label>
        <input type="hidden" name="shipDestination" value={shipDestination} />
      </fieldset>

      {needsEscript ? (
        <EscriptSigningPanel
          patient={patient}
          lines={lines}
          canSign={canSign}
          gateMessage={gateMessage}
          signerLabel={signerLabel}
          npi={npi}
          showSubmit={false}
        />
      ) : null}

      <section className="escript-panel" style={{ marginTop: needsEscript ? 14 : 0 }}>
        <h3>Payment</h3>
        {paymentsSandbox ? (
          <>
            <label className="escript-field">
              <span>Card number</span>
              <input
                inputMode="numeric"
                autoComplete="off"
                placeholder="Sandbox — digits stay in the browser"
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, "");
                  setLast4(digits.slice(-4));
                }}
              />
            </label>
            <input type="hidden" name="last4" value={last4} />
            <p className="muted">Only the last four digits leave this page. Demo payments use PAYMENTS_MODE=sandbox.</p>
          </>
        ) : (
          <>
            <label className="escript-field">
              <span>Gateway payment nonce</span>
              <input name="paymentNonce" placeholder="Opaque data value from Accept.js / Stripe" required />
            </label>
            <label className="escript-field">
              <span>Card last four (display only)</span>
              <input
                name="last4"
                inputMode="numeric"
                maxLength={4}
                value={last4}
                onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
            </label>
            <p className="muted">Live mode — card PAN never hits Wellness Tech servers.</p>
          </>
        )}
      </section>

      {error ? <p className="error">{error}</p> : null}
      <button className="btn btn-accent escript-submit" type="submit" disabled={needsEscript && !canSign} style={{ marginTop: 16 }}>
        {needsEscript ? "Sign eScript & submit order" : "Authorize & submit"}
      </button>
    </form>
  );
}
