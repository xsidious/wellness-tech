"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { completeSignup, confirmMfa, practicePasswordLogin } from "@/lib/actions";
import { TurnstileField } from "@/components/TurnstileField";

export function LoginPanel({ nextPath = "", turnstileSiteKey = "" }: { nextPath?: string; turnstileSiteKey?: string }) {
  const [showPassword, setShowPassword] = useState(false);
  const [state, action, pending] = useActionState(
    async (
      _prev: { error?: string; next?: string; email?: string } | null,
      formData: FormData,
    ) => practicePasswordLogin(formData),
    null,
  );
  const [mfaState, mfaAction, mfaPending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => confirmMfa(formData),
    null,
  );

  const awaitingMfa = state?.next === "mfa";
  const email = state?.email || "";

  if (awaitingMfa && email) {
    return (
      <div className="auth-card">
        <form className="auth-form" action={mfaAction}>
          <input type="hidden" name="next" value={nextPath} />
          <p className="auth-step-note">
            Password accepted for <strong>{email}</strong>. Enter your 6-digit security PIN to finish.
          </p>
          <label className="auth-field">
            <span>Security PIN</span>
            <input
              name="pin"
              inputMode="numeric"
              minLength={6}
              maxLength={6}
              required
              autoFocus
              autoComplete="one-time-code"
              placeholder="••••••"
            />
          </label>
          {mfaState?.error ? (
            <p className="auth-error" role="alert">
              {mfaState.error}
            </p>
          ) : null}
          <button className="btn btn-accent auth-submit" disabled={mfaPending}>
            {mfaPending ? "Verifying…" : "Complete sign-in"}
          </button>
          <p className="auth-meta">
            <Link href="/login">Start over</Link>
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <form className="auth-form" action={action}>
        <label aria-hidden="true" className="auth-honeypot">
          Company website
          <input name="company_website" type="text" tabIndex={-1} autoComplete="off" />
        </label>
        <input type="hidden" name="next" value={nextPath} />
        <label className="auth-field">
          <span>Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            placeholder="you@yourpractice.com"
          />
        </label>
        <label className="auth-field">
          <span>Password</span>
          <span className="auth-password-wrap">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              minLength={8}
              placeholder="Enter your password"
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </span>
        </label>
        <TurnstileField siteKey={turnstileSiteKey} />
        {state?.error ? (
          <p className="auth-error" role="alert">
            {state.error}
          </p>
        ) : null}
        <button className="btn btn-accent auth-submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
        <p className="auth-meta">
          Staff catalog operators use the <Link href="/admin/login">admin login</Link>.
        </p>
      </form>
    </div>
  );
}

export function SignupPanel({
  accountType,
  refCode,
  email,
  turnstileSiteKey = "",
}: {
  accountType: string;
  refCode: string;
  email: string;
  turnstileSiteKey?: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [signed, signupAction, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => completeSignup(formData),
    null,
  );

  return (
    <div className="auth-card">
      <form className="auth-form" action={signupAction}>
        <label aria-hidden="true" className="auth-honeypot">
          Company website
          <input name="company_website" type="text" tabIndex={-1} autoComplete="off" />
        </label>
        <input type="hidden" name="accountType" value={accountType} />
        <input type="hidden" name="ref" value={refCode} />
        <label className="auth-field">
          <span>Email</span>
          <input name="email" type="email" required defaultValue={email} autoComplete="username" />
        </label>
        <label className="auth-field">
          <span>Password</span>
          <span className="auth-password-wrap">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={10}
              autoComplete="new-password"
              placeholder="10+ chars, mixed case, number, symbol"
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </span>
        </label>
        <label className="auth-field">
          <span>Your name</span>
          <input name="name" required autoComplete="name" />
        </label>
        <label className="auth-field">
          <span>Organization</span>
          <input name="legalName" required placeholder="Practice or clinic name" />
        </label>
        <label className="auth-field">
          <span>6-digit security PIN</span>
          <input
            name="pin"
            inputMode="numeric"
            minLength={6}
            maxLength={6}
            required
            autoComplete="off"
            placeholder="Second factor for sign-in"
          />
        </label>
        <TurnstileField siteKey={turnstileSiteKey} />
        {signed?.error ? (
          <p className="auth-error" role="alert">
            {signed.error}
          </p>
        ) : null}
        <button className="btn btn-accent auth-submit" disabled={pending}>
          {pending ? "Creating…" : "Create account"}
        </button>
        <p className="auth-meta">
          Already registered? <Link href="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
