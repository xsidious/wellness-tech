"use client";

import { claimInvitePassword } from "@/lib/portal-ops-actions";
import { PinField } from "@/components/PinField";

export function ClaimAccountForm({ email = "" }: { email?: string }) {
  return (
    <form action={claimInvitePassword} className="ws-message-form auth-form">
      <label className="auth-field">
        <span>Email</span>
        <input name="email" type="email" required defaultValue={email} />
      </label>
      <label className="auth-field">
        <span>New password (10+)</span>
        <input name="password" type="password" required minLength={10} autoComplete="new-password" />
      </label>
      <PinField />
      <button className="btn btn-accent" type="submit">
        Activate account
      </button>
    </form>
  );
}
