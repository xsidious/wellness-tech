import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { rolesOf } from "@/lib/guard";

export default async function AdminPrescribersPage() {
  const credentials = await prisma.prescriberCredential.findMany({
    orderBy: { checkedAt: "desc" },
    include: { user: { include: { org: true } } },
  });

  const owners = await prisma.user.findMany({
    where: {
      OR: [{ roles: { contains: "prescriber" } }, { roles: { contains: "owner" } }],
    },
    include: { org: true, credential: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <>
      <div className="dash-head">
        <div>
          <p className="kicker">Credentials</p>
          <h1>Prescribers</h1>
          <p className="lede">NPIs and clinicians who can place or authorize compound orders.</p>
        </div>
      </div>

      <section className="panel">
        <h2>Credentialed NPIs</h2>
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
                  <td>{row.displayName}</td>
                  <td>{row.npi}</td>
                  <td>{row.specialty || "—"}</td>
                  <td>{row.oigStatus}</td>
                  <td>
                    <Link href={`/admin/practices/${row.user.orgId}`}>{row.user.org.legalName}</Link>
                  </td>
                  <td>{row.user.email}</td>
                </tr>
              ))}
              {!credentials.length ? (
                <tr>
                  <td colSpan={6}>No NPI credentials on file yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Owner / prescriber accounts</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Practice</th>
                <th>NPI</th>
              </tr>
            </thead>
            <tbody>
              {owners.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{rolesOf(user.roles).join(", ")}</td>
                  <td>
                    <Link href={`/admin/practices/${user.orgId}`}>{user.org.legalName}</Link>
                  </td>
                  <td>{user.credential?.npi || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
