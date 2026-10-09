"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { adminPasswordLogin } from "@/lib/actions";

function AdminLoginForm() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/admin";
  const [state, action, pending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => adminPasswordLogin(formData),
    null,
  );

  return (
    <main className="wrap" style={{ maxWidth: 440, margin: "4rem auto", padding: "0 1rem" }}>
      <div className="stack" style={{ gap: "0.75rem" }}>
        <span className="kicker">Wellness Tech</span>
        <h1 style={{ fontSize: "2rem", margin: 0 }}>Staff admin login</h1>
        <p className="lede" style={{ margin: 0 }}>
          Direct access for catalog operators. Practice portals still use the regular email + PIN flow at{" "}
          <Link href="/login">/login</Link>.
        </p>
      </div>

      <form className="form" action={action} style={{ marginTop: "1.5rem" }}>
        <input type="hidden" name="next" value={nextPath.startsWith("/") ? nextPath : "/admin"} />
        {/* Honeypot — leave empty */}
        <label
          aria-hidden="true"
          style={{ position: "absolute", left: "-10000px", height: 0, overflow: "hidden" }}
        >
          Company website
          <input name="company_website" type="text" tabIndex={-1} autoComplete="off" />
        </label>
        <label>
          Admin email
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            defaultValue="admin@wellnesstech.demo"
            placeholder="admin@wellnesstech.demo"
          />
        </label>
        <label>
          Password
          <input name="password" type="password" required autoComplete="current-password" minLength={8} />
        </label>
        <button className="btn btn-accent" disabled={pending} type="submit">
          {pending ? "Signing in…" : "Sign in to admin"}
        </button>
        {state?.error ? <p className="error">{state.error}</p> : null}
      </form>

      <p className="muted" style={{ marginTop: "1.25rem" }}>
        Practice / affiliate sign-in: <Link href="/login">Email + code + PIN</Link>
      </p>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<main className="wrap">Loading admin sign-in…</main>}>
      <AdminLoginForm />
    </Suspense>
  );
}
