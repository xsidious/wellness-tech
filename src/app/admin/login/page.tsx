"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { adminPasswordLogin } from "@/lib/actions";
import { TurnstileField } from "@/components/TurnstileField";

function AdminLoginForm({ turnstileSiteKey }: { turnstileSiteKey: string }) {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/admin";
  const [state, action, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => adminPasswordLogin(formData),
    null,
  );

  return (
    <main className="auth-stage auth-stage-solo">
      <div className="auth-panel-inner auth-solo-inner">
        <p className="kicker auth-kicker">Wellness Tech</p>
        <h1 className="auth-title">Staff admin</h1>
        <p className="auth-lede">
          Catalog operators only. Practice portals use email + password at <Link href="/login">/login</Link>.
        </p>
        <div className="auth-card">
          <form className="auth-form" action={action}>
            <input type="hidden" name="next" value={nextPath.startsWith("/") ? nextPath : "/admin"} />
            <label aria-hidden="true" className="auth-honeypot">
              Company website
              <input name="company_website" type="text" tabIndex={-1} autoComplete="off" />
            </label>
            <label className="auth-field">
              <span>Admin email</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="username"
                defaultValue="admin@wellnesstech.demo"
                placeholder="admin@wellnesstech.demo"
              />
            </label>
            <label className="auth-field">
              <span>Password</span>
              <input name="password" type="password" required autoComplete="current-password" minLength={8} />
            </label>
            <TurnstileField siteKey={turnstileSiteKey} />
            <button className="btn btn-accent auth-submit" disabled={pending} type="submit">
              {pending ? "Signing in…" : "Sign in to admin"}
            </button>
            {state?.error ? (
              <p className="auth-error" role="alert">
                {state.error}
              </p>
            ) : null}
          </form>
        </div>
        <p className="auth-aside">
          Practice / affiliate sign-in: <Link href="/login">Email + password</Link>
        </p>
      </div>
    </main>
  );
}

export default function AdminLoginPage() {
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
  return (
    <Suspense fallback={<main className="wrap">Loading admin sign-in…</main>}>
      <AdminLoginForm turnstileSiteKey={turnstileSiteKey} />
    </Suspense>
  );
}
