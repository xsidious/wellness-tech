import Link from "next/link";
import { notFound } from "next/navigation";
import { adminUpdatePractice } from "@/lib/actions";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { rolesOf } from "@/lib/guard";
import { tierLabel } from "@/lib/rules";

export default async function AdminPracticeDetail({ params }: { params: Promise<{ id: string }> }) {
  const org = await prisma.organization.findUnique({
    where: { id: (await params).id },
    include: {
      users: { include: { credential: true, affiliate: true }, orderBy: { createdAt: "asc" } },
      orders: { orderBy: { createdAt: "desc" }, take: 20, include: { clinicalPatient: true } },
      clinicalPatients: { orderBy: { updatedAt: "desc" }, take: 20 },
      apiKeys: true,
    },
  });
  if (!org) notFound();

  return (
    <>
      <div className="dash-head">
        <div>
          <p className="kicker">Practice</p>
          <p className="muted">
            <Link href="/admin/practices">← Practices</Link>
          </p>
          <h1>{org.legalName}</h1>
          <p className="muted">
            {org.type} · {tierLabel(org.verificationTier)} · {org.status}
          </p>
        </div>
      </div>

      <section className="panel">
        <h2>Settings</h2>
        <form action={adminUpdatePractice} className="form">
          <input type="hidden" name="id" value={org.id} />
          <label>
            Legal name
            <input name="legalName" defaultValue={org.legalName} required />
          </label>
          <label>
            Verification tier (0–3)
            <input name="verificationTier" type="number" min={0} max={3} defaultValue={org.verificationTier} />
          </label>
          <label>
            Status
            <select name="status" defaultValue={org.status}>
              <option value="active">active</option>
              <option value="pending">pending</option>
              <option value="suspended">suspended</option>
            </select>
          </label>
          <label>
            Assigned rep
            <input name="assignedRep" defaultValue={org.assignedRep} />
          </label>
          <button className="btn btn-accent" type="submit">
            Save practice
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>People</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Roles</th>
                <th>NPI</th>
              </tr>
            </thead>
            <tbody>
              {org.users.map((person) => (
                <tr key={person.id}>
                  <td>{person.name}</td>
                  <td>{person.email}</td>
                  <td>{rolesOf(person.roles).join(", ")}</td>
                  <td>
                    {person.credential ? (
                      <Link href="/admin/prescribers">{person.credential.npi}</Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2>Recent orders</h2>
          <ul>
            {org.orders.map((order) => (
              <li key={order.id}>
                <Link href={`/admin/orders/${order.id}`}>{order.invoiceNumber}</Link>
                {" · "}
                {order.status} · {money(order.totalCents)}
                {order.clinicalPatient ? ` · ${order.clinicalPatient.fullName}` : ""}
              </li>
            ))}
            {!org.orders.length ? <li className="muted">No orders.</li> : null}
          </ul>
        </section>
        <section className="panel">
          <h2>Patients</h2>
          <ul>
            {org.clinicalPatients.map((patient) => (
              <li key={patient.id}>
                <Link href={`/admin/patients/${patient.id}`}>{patient.fullName}</Link>
                {" · "}
                {patient.email}
              </li>
            ))}
            {!org.clinicalPatients.length ? <li className="muted">No clinical charts.</li> : null}
          </ul>
        </section>
      </div>
    </>
  );
}
