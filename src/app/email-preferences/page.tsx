"use client";

import { useState } from "react";
import Link from "next/link";
import { MarketingShell } from "@/components/MarketingShell";

export default function EmailPreferencesPage() {
  const [email, setEmail] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirm) {
      setStatus("error");
      setMessage("Confirm that you want to opt out of marketing emails.");
      return;
    }
    setStatus("saving");
    const res = await fetch("/api/email-preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, action: "opt_out", source: "email-preferences" }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!res.ok) {
      setStatus("error");
      setMessage(data.error || "Could not save your preference.");
      return;
    }
    setStatus("done");
    setMessage(data.message || "You are opted out of marketing emails.");
  }

  return (
    <MarketingShell>
      <main className="wrap" style={{ padding: "48px 0 72px", maxWidth: 560 }}>
        <p className="eyebrow">Email preferences</p>
        <h1>Opt out of marketing email</h1>
        <p style={{ color: "var(--muted)", marginTop: 12 }}>
          We only send promotional email with your permission. Enter your address to stop marketing messages from
          Wellness Tech Distribution.
        </p>
        <form onSubmit={onSubmit} className="card" style={{ marginTop: 24, display: "grid", gap: 14 }}>
          <label>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ display: "block", width: "100%", marginTop: 6 }}
            />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
            <span>I want to opt out of Wellness Tech marketing emails.</span>
          </label>
          <button type="submit" className="btn btn-accent" disabled={status === "saving"}>
            {status === "saving" ? "Saving…" : "Confirm opt-out"}
          </button>
          {message ? <p style={{ color: status === "error" ? "#b00020" : "var(--ink)" }}>{message}</p> : null}
        </form>
        <p style={{ marginTop: 20, fontSize: 13, color: "var(--muted)" }}>
          See also our <Link href="/accessibility">accessibility statement</Link>.
        </p>
      </main>
    </MarketingShell>
  );
}
