import Link from "next/link";
import { PageHeader, SectionCard, StatusBadge } from "@/components/portal/Workspace";
import { requireUser, rolesOf } from "@/lib/guard";
import { savePracticeOnboarding } from "@/lib/practice-actions";
import { prisma } from "@/lib/prisma";
import { tierLabel } from "@/lib/rules";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  const roles = rolesOf(user.roles);
  const { saved } = await searchParams;
  const [credential, teamCount, location, team] = await Promise.all([
    prisma.prescriberCredential.findUnique({ where: { userId: user.id } }),
    prisma.user.count({ where: { orgId: user.orgId } }),
    prisma.practiceLocation.findFirst({ where: { orgId: user.orgId, isDefault: true } }),
    prisma.user.findMany({ where: { orgId: user.orgId }, orderBy: { createdAt: "asc" }, take: 20 }),
  ]);

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Account"
        title="Settings & onboarding"
        lede="Locations, NPI credentials, and team invites — complete onboarding to unlock full clinic workflows."
      />
      {saved ? <p className="note">Practice settings saved.</p> : null}

      <div className="ws-stat-grid">
        <div className="ws-stat">
          <span className="ws-stat-label">Onboarding</span>
          <strong className="ws-stat-value" style={{ fontSize: "1.1rem" }}>
            <StatusBadge tone={user.org.onboardingComplete ? "ok" : "warn"}>
              {user.org.onboardingComplete ? "complete" : "in progress"}
            </StatusBadge>
          </strong>
        </div>
        <div className="ws-stat">
          <span className="ws-stat-label">Verification</span>
          <strong className="ws-stat-value" style={{ fontSize: "1.05rem" }}>
            {tierLabel(user.org.verificationTier)}
          </strong>
        </div>
        <div className="ws-stat">
          <span className="ws-stat-label">Team seats</span>
          <strong className="ws-stat-value">{teamCount}</strong>
        </div>
      </div>

      <SectionCard title="Practice location" description="Default ship-to-practice address.">
        <form action={savePracticeOnboarding} className="ws-message-form">
          <div className="ws-kv">
            <label>
              Location label
              <input name="locationLabel" defaultValue={location?.label || "Main"} />
            </label>
            <label>
              Street
              <input name="street1" defaultValue={location?.street1 || ""} required />
            </label>
            <label>
              City
              <input name="city" defaultValue={location?.city || ""} required />
            </label>
            <label>
              State
              <input name="state" defaultValue={location?.state || ""} required />
            </label>
            <label>
              ZIP
              <input name="zip" defaultValue={location?.zip || ""} required />
            </label>
            <label>
              Phone
              <input name="phone" defaultValue={location?.phone || user.phone || ""} />
            </label>
          </div>

          <h3 style={{ marginTop: 8 }}>Invite a teammate</h3>
          <div className="ws-kv">
            <label>
              Name
              <input name="inviteName" placeholder="Optional" />
            </label>
            <label>
              Email
              <input name="inviteEmail" type="email" placeholder="Optional" />
            </label>
          </div>
          <button className="btn btn-accent" type="submit">
            Save onboarding
          </button>
        </form>
      </SectionCard>

      <div className="ws-split">
        <SectionCard title="Your security">
          <div className="ws-kv">
            <div>
              <span>Signed in as</span>
              <strong>
                {user.name}
                <div className="muted">{user.email}</div>
              </strong>
            </div>
            <div>
              <span>Roles</span>
              <div className="ws-chip-row">
                {roles.map((role) => (
                  <span key={role} className="ws-chip">
                    {role}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <span>MFA / PIN</span>
              <StatusBadge tone={user.mfaEnabled ? "ok" : "warn"}>
                {user.mfaEnabled ? "Enabled" : "Not enabled"}
              </StatusBadge>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Prescriber credential">
          {credential ? (
            <div className="ws-kv">
              <div>
                <span>Display name</span>
                <strong>{credential.displayName}</strong>
              </div>
              <div>
                <span>NPI</span>
                <strong>{credential.npi}</strong>
              </div>
              <div>
                <span>Specialty</span>
                <strong>{credential.specialty || "—"}</strong>
              </div>
              <div>
                <span>OIG</span>
                <StatusBadge tone={credential.oigStatus === "cleared" ? "ok" : "warn"}>
                  {credential.oigStatus}
                </StatusBadge>
              </div>
            </div>
          ) : (
            <p className="muted">
              No NPI on this user.{" "}
              <Link href="/signup/npi">Add credential</Link> to authorize 503A/503B compounds.
            </p>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Team">
        <ul>
          {team.map((person) => (
            <li key={person.id}>
              {person.name} · {person.email} · {rolesOf(person.roles).join(", ")}
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
