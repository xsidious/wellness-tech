import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { requireUser, rolesOf } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export default async function PractitionersPage() {
  const user = await requireUser();
  const roles = rolesOf(user.roles);
  const canManage = roles.some((role) => ["owner", "prescriber", "admin", "staff"].includes(role));

  const team = await prisma.user.findMany({
    where: { orgId: user.orgId },
    include: { credential: true },
    orderBy: { createdAt: "asc" },
  });

  const credentialed = team.filter((member) => member.credential);
  const canSign = team.filter((member) => rolesOf(member.roles).some((r) => ["prescriber", "owner"].includes(r)));

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Clinical team"
        title="Practitioners"
        lede="Credentialed NPIs who can authorize compounds, attach signatures, and release pharmacy orders for your practice."
        actions={
          canManage ? (
            <Link className="btn btn-ghost" href="/portal/settings">
              Account settings
            </Link>
          ) : null
        }
      />

      <div className="ws-stat-grid">
        <div className="ws-stat">
          <span className="ws-stat-label">Team members</span>
          <strong className="ws-stat-value">{team.length}</strong>
        </div>
        <div className="ws-stat ws-stat-accent">
          <span className="ws-stat-label">NPI credentials</span>
          <strong className="ws-stat-value">{credentialed.length}</strong>
        </div>
        <div className="ws-stat ws-stat-ok">
          <span className="ws-stat-label">Signing authority</span>
          <strong className="ws-stat-value">{canSign.length}</strong>
        </div>
      </div>

      <SectionCard
        title="Credentialed clinicians"
        description="NPI, specialty, and OIG status used when routing prescriptions to the pharmacy network."
      >
        {credentialed.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Clinician</th>
                  <th>NPI</th>
                  <th>Specialty</th>
                  <th>OIG</th>
                  <th>Verified</th>
                </tr>
              </thead>
              <tbody>
                {credentialed.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <b>{member.credential?.displayName || member.name}</b>
                      <div className="muted">{member.email}</div>
                    </td>
                    <td>{member.credential?.npi}</td>
                    <td>{member.credential?.specialty || "—"}</td>
                    <td>
                      <StatusBadge tone={statusTone(member.credential?.oigStatus || "")}>
                        {member.credential?.oigStatus || "—"}
                      </StatusBadge>
                    </td>
                    <td className="muted">
                      {member.credential?.checkedAt
                        ? member.credential.checkedAt.toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No NPI credentials on file"
            body="Add a credentialed prescriber so compound orders can carry a signing clinician into pharmacy routing."
          />
        )}
      </SectionCard>

      <SectionCard title="Practice roster" description="Everyone on this organization, with roles that control catalog, billing, and clinical access.">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Roles</th>
                <th>MFA</th>
                <th>Last login</th>
              </tr>
            </thead>
            <tbody>
              {team.map((member) => (
                <tr key={member.id}>
                  <td>
                    <b>{member.name}</b>
                    {member.id === user.id ? <span className="ws-chip ws-chip-you">You</span> : null}
                  </td>
                  <td>{member.email}</td>
                  <td>
                    <div className="ws-chip-row">
                      {rolesOf(member.roles).map((role) => (
                        <span key={role} className="ws-chip">
                          {role}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <StatusBadge tone={member.mfaEnabled ? "ok" : "warn"}>
                      {member.mfaEnabled ? "On" : "Off"}
                    </StatusBadge>
                  </td>
                  <td className="muted">
                    {member.lastLoginAt ? member.lastLoginAt.toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Signature & authorization" description="How practitioner signatures attach to patient charts and pharmacy orders.">
        <ol className="ws-steps">
          <li>
            <b>Patient consents</b> — Intake signatures (patient + media / nursing) mirror from KIAN onto the chart.
          </li>
          <li>
            <b>Prescriber sig</b> — Compound lines require a credentialed clinician and written directions (sig / days supply).
          </li>
          <li>
            <b>Pharmacy release</b> — Authorized orders route to 503A/503B partners with NPI and ship-to locked.
          </li>
        </ol>
        <div className="ws-head-actions" style={{ marginTop: 16 }}>
          <Link className="btn btn-ghost" href="/portal/patients">
            Open patient charts
          </Link>
          <Link className="btn btn-accent" href="/portal/pharmacies">
            View pharmacies
          </Link>
        </div>
      </SectionCard>
    </div>
  );
}
