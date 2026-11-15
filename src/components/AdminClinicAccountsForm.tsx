"use client";

import { useActionState } from "react";
import { adminProvisionClinicAccounts } from "@/lib/admin-actions";
import { CLINIC_OWNER_SEEDS } from "@/lib/clinic-account-seeds";

type Result = Awaited<ReturnType<typeof adminProvisionClinicAccounts>> | { error: string } | null;

export function AdminClinicAccountsForm() {
  const [state, action, pending] = useActionState(
    async (_prev: Result, formData: FormData): Promise<Result> => {
      try {
        return await adminProvisionClinicAccounts(formData);
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Provision failed." };
      }
    },
    null,
  );

  const accounts = state && "accounts" in state ? state.accounts : null;

  return (
    <div className="ws-stack" style={{ gap: "1rem" }}>
      <p className="muted" style={{ margin: 0 }}>
        Links human owners to each partner clinic org (KIAN, Facial Design, 4everglow, Threefold, Hope &amp; Haven).
        Invite teammates later with <code>/signup?clinic=&lt;code&gt;</code>.
      </p>
      <ul className="ws-steps">
        {CLINIC_OWNER_SEEDS.map((seed) => (
          <li key={seed.site}>
            <b>{seed.name}</b> — <code>{seed.email}</code> · clinic code <code>{seed.clinicCode}</code>
          </li>
        ))}
      </ul>
      <form action={action} className="ws-head-actions" style={{ alignItems: "center", gap: "0.75rem" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
          <input type="checkbox" name="resetPasswords" value="1" />
          <span>Rotate passwords / PINs for existing owners</span>
        </label>
        <button className="btn btn-accent" type="submit" disabled={pending}>
          {pending ? "Provisioning…" : "Provision clinic portal accounts"}
        </button>
      </form>
      {state && "error" in state && state.error ? (
        <p className="auth-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {accounts?.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Clinic</th>
                <th>Email</th>
                <th>Code</th>
                <th>Password</th>
                <th>PIN</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((row) => (
                <tr key={row.site}>
                  <td>
                    <b>{row.legalName}</b>
                    <div className="muted">{row.site}</div>
                  </td>
                  <td>
                    <code>{row.email}</code>
                  </td>
                  <td>
                    <code>{row.clinicCode}</code>
                  </td>
                  <td>
                    <code>{row.password}</code>
                  </td>
                  <td>
                    <code>{row.pin}</code>
                  </td>
                  <td>
                    {row.created ? "created" : row.reset ? "reset" : "linked"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">
            Login: <a href={accounts[0]?.loginUrl}>{accounts[0]?.loginUrl}</a>
          </p>
        </div>
      ) : null}
    </div>
  );
}
