"use client";

import { useActionState } from "react";
import { adminProvisionAccount, type ProvisionAccountResult } from "@/lib/admin-actions";

export function AdminProvisionForm({ defaultType = "practice" }: { defaultType?: "practice" | "affiliate" }) {
  const [state, action, pending] = useActionState(
    async (_prev: ProvisionAccountResult | null, formData: FormData) => adminProvisionAccount(_prev, formData),
    null,
  );

  return (
    <div className="ws-stack" style={{ gap: "1rem" }}>
      <form className="auth-form" action={action} style={{ maxWidth: 520 }}>
        <input type="hidden" name="accountType" value={defaultType} />
        <label className="auth-field">
          <span>Email</span>
          <input name="email" type="email" required placeholder="partner@clinic.com" />
        </label>
        <label className="auth-field">
          <span>Full name</span>
          <input name="name" required placeholder="Dr. Jane Smith" />
        </label>
        <label className="auth-field">
          <span>{defaultType === "affiliate" ? "Affiliate / company name" : "Practice / clinic name"}</span>
          <input name="legalName" required placeholder="Organization legal name" />
        </label>
        <label className="auth-field">
          <span>Temporary password (optional)</span>
          <input
            name="password"
            type="text"
            minLength={10}
            placeholder="Leave blank to auto-generate"
            autoComplete="off"
          />
        </label>
        <label className="auth-field">
          <span>6-digit PIN (optional)</span>
          <input name="pin" inputMode="numeric" minLength={6} maxLength={6} placeholder="Auto if blank" />
        </label>
        <label className="auth-field">
          <span>Referral affiliate code (optional)</span>
          <input name="ref" placeholder="e.g. FAIRFAX" />
        </label>
        {state?.error ? (
          <p className="auth-error" role="alert">
            {state.error}
          </p>
        ) : null}
        <button className="btn btn-accent" type="submit" disabled={pending}>
          {pending
            ? "Creating…"
            : defaultType === "affiliate"
              ? "Create affiliate login"
              : "Create practitioner login"}
        </button>
      </form>

      {state?.email && state.temporaryPassword ? (
        <div className="note" role="status" style={{ maxWidth: 560 }}>
          <p>
            <strong>Account ready — copy these now</strong> (shown once). Send them to the partner securely.
          </p>
          <p>
            Login: <a href={state.loginUrl}>{state.loginUrl}</a>
          </p>
          <p>
            Email: <code>{state.email}</code>
          </p>
          <p>
            Password: <code>{state.temporaryPassword}</code>
          </p>
          <p>
            Security PIN: <code>{state.pin}</code>
          </p>
          {state.affiliateCode ? (
            <p>
              Affiliate code: <code>{state.affiliateCode}</code>
            </p>
          ) : (
            <p className="muted">Prescribers finish NPI + license at /signup/npi after first login.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
