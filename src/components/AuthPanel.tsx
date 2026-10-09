"use client";

import { useActionState } from "react";
import { completeSignup, confirmMfa, requestMagic, verifyMagic } from "@/lib/actions";

export function LoginPanel({ nextPath = "" }: { nextPath?: string }) {
  const [requested, requestAction, requesting] = useActionState(
    async (_prev: { code?: string; email?: string; error?: string } | null, formData: FormData) => requestMagic(formData),
    null,
  );
  const [verified, verifyAction, verifying] = useActionState(
    async (_prev: { error?: string; next?: string; email?: string } | null, formData: FormData) => verifyMagic(formData),
    null,
  );
  const [mfaError, mfaAction, mfaPending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => confirmMfa(formData),
    null,
  );
  const email = verified?.email || requested?.email || "";
  const onPin = verified?.next === "mfa" || verified?.next === "mfa-setup";
  return (
    <div className="form">
      {!email ? (
        <form action={requestAction}>
          <p className="muted">Step 1 of 3. Practice / affiliate email, then the code that appears here.</p>
          <label aria-hidden="true" style={{ position: "absolute", left: "-10000px", height: 0, overflow: "hidden" }}>
            Company website
            <input name="company_website" type="text" tabIndex={-1} autoComplete="off" />
          </label>
          <label>Email<input name="email" type="email" required autoComplete="username" placeholder="owner@fairfax.demo" /></label>
          <button className="btn btn-accent" disabled={requesting}>{requesting ? "Sending code…" : "Email me a code"}</button>
          {requested?.error ? <p className="error">{requested.error}</p> : null}
          <p className="muted">Staff admin? <a href="/admin/login">Use the admin password login</a>.</p>
        </form>
      ) : null}
      {email && !onPin ? (
        <form action={verifyAction}>
          <p className="muted">Step 2 of 3. Enter this code for {email}. It is not the PIN.</p>
          {requested?.code ? <p className="note">Your code: <strong>{requested.code}</strong></p> : null}
          <input type="hidden" name="email" value={email} />
          <label>Code<input name="code" inputMode="numeric" autoComplete="one-time-code" required autoFocus /></label>
          <button className="btn btn-dark" disabled={verifying}>{verifying ? "Checking…" : "Continue"}</button>
          {verified?.error ? <p className="error">{verified.error}</p> : null}
          {verified?.next === "signup" ? <p>No account yet. <a href={`/signup?email=${encodeURIComponent(email)}`}>Create one</a>.</p> : null}
        </form>
      ) : null}
      {onPin ? (
        <form action={mfaAction}>
          <input type="hidden" name="next" value={nextPath} />
          <p className="muted">Step 3 of 3. Demo accounts use PIN 246810.</p>
          <label>6-digit PIN<input name="pin" inputMode="numeric" minLength={6} maxLength={6} required autoFocus /></label>
          <button className="btn btn-accent" disabled={mfaPending}>{mfaPending ? "Signing in…" : "Sign in"}</button>
          {mfaError?.error ? <p className="error">{mfaError.error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}

export function SignupPanel({ accountType, refCode, email }: { accountType: string; refCode: string; email: string }) {
  const [requested, requestAction] = useActionState(
    async (_prev: { code?: string; email?: string; error?: string } | null, formData: FormData) => requestMagic(formData),
    null,
  );
  const [verified, verifyAction] = useActionState(
    async (_prev: { error?: string; next?: string; email?: string } | null, formData: FormData) => verifyMagic(formData),
    null,
  );
  const [signed, signupAction] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => completeSignup(formData),
    null,
  );
  const readyEmail = verified?.email || requested?.email || email;
  return (
    <div className="stack">
      <form className="form" action={requestAction}>
        <label>Email<input name="email" type="email" required defaultValue={readyEmail} /></label>
        <button className="btn btn-accent">Email me a code</button>
        {requested?.code ? <p className="note">Sandbox code: <strong>{requested.code}</strong></p> : null}
        {requested?.error ? <p className="error">{requested.error}</p> : null}
      </form>
      <form className="form" action={verifyAction}>
        <input type="hidden" name="email" value={readyEmail} />
        <label>Code<input name="code" required /></label>
        <button className="btn btn-dark" disabled={!readyEmail}>Verify email</button>
        {verified?.error ? <p className="error">{verified.error}</p> : null}
      </form>
      {verified?.next ? (
        <form className="form" action={signupAction}>
          <input type="hidden" name="accountType" value={accountType} />
          <input type="hidden" name="ref" value={refCode} />
          <label>Your name<input name="name" required /></label>
          <label>Organization<input name="legalName" required /></label>
          <label>6-digit second factor<input name="pin" inputMode="numeric" minLength={6} maxLength={6} required /></label>
          <button className="btn btn-accent">Create account</button>
          {signed?.error ? <p className="error">{signed.error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
