"use client";

import { useState } from "react";
import { SignaturePad } from "@/components/escript/SignaturePad";
import { placeOrder } from "@/lib/actions";

export function CheckoutForm({
  needsEscript = false,
  paymentsSandbox = true,
}: {
  needsEscript?: boolean;
  paymentsSandbox?: boolean;
}) {
  const [last4, setLast4] = useState("");
  const [shipDestination, setShipDestination] = useState<"PRACTICE" | "PATIENT">("PRACTICE");
  const [error, setError] = useState("");

  return (
    <form
      className="form"
      action={async (formData) => {
        const result = await placeOrder(formData);
        if (result?.error) setError(result.error);
      }}
    >
      <fieldset className="stack" style={{ border: "none", padding: 0, margin: 0 }}>
        <legend className="kicker">Ship destination</legend>
        <label className="row" style={{ gap: 8, alignItems: "center" }}>
          <input
            type="radio"
            name="shipDestination"
            value="PRACTICE"
            checked={shipDestination === "PRACTICE"}
            onChange={() => setShipDestination("PRACTICE")}
          />
          Ship to practice
        </label>
        <label className="row" style={{ gap: 8, alignItems: "center" }}>
          <input
            type="radio"
            name="shipDestination"
            value="PATIENT"
            checked={shipDestination === "PATIENT"}
            onChange={() => setShipDestination("PATIENT")}
          />
          Ship to patient
        </label>
      </fieldset>

      {needsEscript ? (
        <div className="stack">
          <p className="note">503A / Rx 503B lines require a signed eScript before pharmacy routing.</p>
          <label>
            Directions
            <input name="directions" defaultValue="As directed by prescribing clinician." />
          </label>
          <SignaturePad />
        </div>
      ) : null}

      {paymentsSandbox ? (
        <>
          <label>
            Card number
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
          <label>
            Gateway payment nonce
            <input name="paymentNonce" placeholder="Opaque data value from Accept.js / Stripe" required />
          </label>
          <label>
            Card last four (display only)
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

      {error ? <p className="error">{error}</p> : null}
      <button className="btn btn-accent" type="submit">
        {needsEscript ? "Sign eScript & submit" : "Authorize & submit"}
      </button>
    </form>
  );
}
