import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { rolesOf } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export default async function AdminPrescribersPage() {
  const owners = await prisma.user.findMany({
    where: {
      OR: [{ roles: { contains: "prescriber" } }, { roles: { contains: "owner" } }, { credential: { isNot: null } }],
    },
    include: {
      org: true,
      credential: true,
      _count: { select: { orders: true, escriptsSigned: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const credentials = await prisma.prescriberCredential.findMany({
    orderBy: { checkedAt: "desc" },
    include: { user: { include: { org: true } } },
  });

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Clinical network"
        title="Prescribers"
        lede="Clinicians across the network — open a profile to see which patients they brought and every prescription attributed to them."
      />

      <SectionCard title={`${owners.length} clinicians`} description="Accounts with owner/prescriber roles or an NPI credential." flush>
        {owners.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Prescriber</th>
                  <th>NPI / specialty</th>
                  <th>Practice</th>
                  <th>Roles</th>
                  <th>Orders placed</th>
                  <th>eScripts signed</th>
                  <th>OIG</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {owners.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <b>{user.credential?.displayName || user.name}</b>
                      <div className="muted">{user.email}</div>
                    </td>
                    <td>
                      {user.credential?.npi ? <div>NPI {user.credential.npi}</div> : <span className="muted">No NPI</span>}
                      <div className="muted">{user.credential?.specialty || "—"}</div>
                    </td>
                    <td>
                      <Link href={`/admin/practices/${user.orgId}`}>{user.org.legalName}</Link>
                    </td>
                    <td className="muted">{rolesOf(user.roles).join(", ")}</td>
                    <td>{user._count.orders}</td>
                    <td>{user._count.escriptsSigned}</td>
                    <td>
                      <StatusBadge tone={statusTone(user.credential?.oigStatus || "pending")}>
                        {user.credential?.oigStatus || "pending"}
                      </StatusBadge>
                    </td>
                    <td>
                      <Link className="ws-text-link" href={`/admin/prescribers/${user.id}`}>
                        Patients & Rx
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No clinicians yet" body="Prescriber accounts appear when practices onboard NPIs." />
        )}
      </SectionCard>

      <SectionCard title="Credential registry" description="NPI verification snapshots on file.">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Display name</th>
                <th>NPI</th>
                <th>Specialty</th>
                <th>OIG</th>
                <th>Practice</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {credentials.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/admin/prescribers/${row.userId}`}>
                      <b>{row.displayName}</b>
                    </Link>
                  </td>
                  <td>{row.npi}</td>
                  <td>{row.specialty || "—"}</td>
                  <td>
                    <StatusBadge tone={statusTone(row.oigStatus)}>{row.oigStatus}</StatusBadge>
                  </td>
                  <td>
                    <Link href={`/admin/practices/${row.user.orgId}`}>{row.user.org.legalName}</Link>
                  </td>
                  <td className="muted">{row.user.email}</td>
                </tr>
              ))}
              {!credentials.length ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No NPI credentials on file yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
