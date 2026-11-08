import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatTile,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { requireUser, rolesOf } from "@/lib/guard";
import { inviteTeamMember } from "@/lib/portal-ops-actions";
import { prisma } from "@/lib/prisma";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string }>;
}) {
  const user = await requireUser();
  const notices = await searchParams;
  const canInvite = rolesOf(user.roles).some((r) => ["owner", "admin"].includes(r));
  const team = await prisma.user.findMany({
    where: { orgId: user.orgId },
    include: { credential: true },
    orderBy: { createdAt: "asc" },
  });

  const prescribers = team.filter((m) => rolesOf(m.roles).some((r) => ["prescriber", "owner"].includes(r)));
  const staff = team.filter((m) => !rolesOf(m.roles).some((r) => ["prescriber", "owner", "patient", "affiliate"].includes(r)));

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Practice"
        title="Team"
        lede="Prescribers and staff — each with their own login. Invited users claim a password before signing in."
        actions={
          <Link className="btn btn-ghost" href="/portal/practitioners">
            Credentials view
          </Link>
        }
      />
      {notices.invited ? <p className="note">Invite sent. They can claim their account from the email link.</p> : null}

      <div className="ws-stat-grid">
        <StatTile label="Prescribers" value={prescribers.length} tone="accent" />
        <StatTile label="Staff" value={staff.length} />
        <StatTile label="Total seats" value={team.length} />
      </div>

      {canInvite ? (
        <SectionCard title="Invite teammate" description="Choose a role. Prescribers can include NPI and state license.">
          <form action={inviteTeamMember} className="ws-message-form">
            <div className="ws-kv">
              <label>
                Name
                <input name="name" required />
              </label>
              <label>
                Email
                <input name="email" type="email" required />
              </label>
              <label>
                Role
                <select name="role" defaultValue="staff">
                  <option value="staff">Staff</option>
                  <option value="billing">Billing</option>
                  <option value="prescriber">Prescriber</option>
                  <option value="owner">Owner</option>
                </select>
              </label>
              <label>
                NPI (prescriber)
                <input name="npi" placeholder="10 digits" />
              </label>
              <label>
                Specialty
                <input name="specialty" />
              </label>
              <label>
                License state
                <input name="licenseState" placeholder="FL" maxLength={2} />
              </label>
              <label>
                License #
                <input name="licenseNumber" />
              </label>
              <label>
                DEA
                <input name="dea" />
              </label>
            </div>
            <button className="btn btn-accent" type="submit">
              Send invite
            </button>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title="Roster">
        {team.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Roles</th>
                  <th>NPI / licenses</th>
                  <th>Login</th>
                </tr>
              </thead>
              <tbody>
                {team.map((member) => {
                  const login = member.lastLoginAt ? "active" : member.passwordHash ? "invited" : "pending claim";
                  const licenses = (() => {
                    try {
                      return JSON.parse(member.credential?.licensesJson || "[]") as { state: string; licenseNumber: string }[];
                    } catch {
                      return [];
                    }
                  })();
                  return (
                    <tr key={member.id}>
                      <td>
                        <b>{member.credential?.displayName || member.name}</b>
                        <div className="muted">{member.email}</div>
                      </td>
                      <td>{rolesOf(member.roles).join(", ")}</td>
                      <td>
                        {member.credential?.npi || "—"}
                        {licenses.length ? (
                          <div className="muted">
                            {licenses.map((l) => `${l.state} ${l.licenseNumber}`).join(" · ")}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <StatusBadge tone={statusTone(login)}>{login}</StatusBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No team yet" body="Invite your first staff or prescriber." />
        )}
      </SectionCard>
    </div>
  );
}
