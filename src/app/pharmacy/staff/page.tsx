import { EmptyState, PageHeader, SectionCard } from "@/components/portal/Workspace";
import { rolesOf, requireUser } from "@/lib/guard";
import { invitePharmacyStaff } from "@/lib/pharmacy-actions";
import { resolvePharmacyScope } from "@/lib/pharmacy-scope";

export default async function PharmacyStaffPage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string }>;
}) {
  const user = await requireUser();
  const scope = await resolvePharmacyScope(user);
  const q = await searchParams;

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Pharmacy"
        title="Staff seats"
        lede="Pharmacists and technicians who can work the queue for this pharmacy."
      />
      {q.invited ? <p className="note">Staff member invited / linked.</p> : null}

      {!scope.pharmacy ? (
        <SectionCard title="No pharmacy linked">
          <p className="muted">Link a pharmacy to this login before inviting staff.</p>
        </SectionCard>
      ) : (
        <>
          <SectionCard title={`${scope.pharmacy.users.length} seats`} flush>
            {scope.pharmacy.users.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Roles</th>
                      <th>Last login</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scope.pharmacy.users.map((member) => (
                      <tr key={member.id}>
                        <td>
                          <b>{member.name}</b>
                          {member.id === user.id ? <span className="ws-chip-you">You</span> : null}
                        </td>
                        <td className="muted">{member.email}</td>
                        <td>{rolesOf(member.roles).join(", ")}</td>
                        <td className="muted">
                          {member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleString() : "Never"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No staff yet" body="Invite pharmacy users so they can sign in and work the queue." />
            )}
          </SectionCard>

          <SectionCard title="Invite staff">
            <form action={invitePharmacyStaff} className="ws-message-form">
              <div className="ws-kv">
                <label>
                  <span>Full name</span>
                  <input name="name" required placeholder="Alex Pharmacist" />
                </label>
                <label>
                  <span>Email</span>
                  <input name="email" type="email" required placeholder="rx@pharmacy.com" />
                </label>
              </div>
              <p className="muted">
                Creates or links a user with the <b>pharmacy</b> role and this pharmacy id. They sign in at /login (or
                magic code if configured).
              </p>
              <button className="btn btn-accent" type="submit">
                Invite staff
              </button>
            </form>
          </SectionCard>
        </>
      )}
    </div>
  );
}
