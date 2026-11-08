import Link from "next/link";
import { claimInvitePassword } from "@/lib/portal-ops-actions";

export default async function ClaimAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; error?: string }>;
}) {
  const q = await searchParams;
  return (
    <main className="auth-shell">
      <div className="auth-card" style={{ maxWidth: 480, margin: "48px auto" }}>
        <h1>Claim your account</h1>
        <p className="muted">Set a password and 6-digit PIN for your Wellness Tech invite.</p>
        {q.error ? <p className="error">{decodeURIComponent(q.error)}</p> : null}
        <form action={claimInvitePassword} className="ws-message-form">
          <label>
            Email
            <input name="email" type="email" required defaultValue={q.email || ""} />
          </label>
          <label>
            New password (10+)
            <input name="password" type="password" required minLength={10} autoComplete="new-password" />
          </label>
          <label>
            6-digit security PIN
            <input name="pin" inputMode="numeric" required minLength={6} maxLength={6} />
          </label>
          <button className="btn btn-accent" type="submit">
            Activate account
          </button>
        </form>
        <p className="muted" style={{ marginTop: 16 }}>
          Already activated? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
