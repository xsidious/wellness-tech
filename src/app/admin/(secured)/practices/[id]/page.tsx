import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, SectionCard, StatusBadge, statusTone } from "@/components/portal/Workspace";
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
      orders: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { clinicalPatient: true, placedBy: true },
      },
      clinicalPatients: { orderBy: { updatedAt: "desc" }, take: 40 },
      locations: true,
      apiKeys: true,
    },
  });
  if (!org) notFound();

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Practice"
        title={org.legalName}
        lede={`${org.type} · ${tierLabel(org.verificationTier)} · ${org.status} · onboarding ${org.onboardingComplete ? "complete" : "pending"}`}
        actions={
          <Link className="btn btn-ghost" href="/admin/practices">
            ← Practices
          </Link>
        }
      />

      <SectionCard title="Settings">
        <form action={adminUpdatePractice} className="ws-message-form">
          <input type="hidden" name="id" value={org.id} />
          <div className="ws-kv">
            <div>
              <span>Legal name</span>
              <input name="legalName" defaultValue={org.legalName} required />
            </div>
            <div>
              <span>Verification tier (0–3)</span>
              <input name="verificationTier" type="number" min={0} max={3} defaultValue={org.verificationTier} />
            </div>
            <div>
              <span>Status</span>
              <select name="status" defaultValue={org.status}>
                <option value="active">active</option>
                <option value="pending">pending</option>
                <option value="suspended">suspended</option>
              </select>
            </div>
            <div>
              <span>Assigned rep</span>
              <input name="assignedRep" defaultValue={org.assignedRep} />
            </div>
          </div>
          <button className="btn btn-accent" type="submit">
            Save practice
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Locations">
        <ul className="ws-steps">
          {org.locations.map((loc) => (
            <li key={loc.id}>
              <b>{loc.label}</b>
              {loc.isDefault ? " · default" : ""} — {[loc.street1, loc.city, loc.state, loc.zip].filter(Boolean).join(", ") || "No address"}
            </li>
          ))}
          {!org.locations.length ? <li className="muted">No practice locations yet.</li> : null}
        </ul>
      </SectionCard>

      <SectionCard title="People" description="Prescribers link through to patients & prescriptions." flush>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Roles</th>
                <th>NPI</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {org.users.map((person) => (
                <tr key={person.id}>
                  <td>
                    <b>{person.name}</b>
                  </td>
                  <td className="muted">{person.email}</td>
                  <td>{rolesOf(person.roles).join(", ")}</td>
                  <td>{person.credential?.npi || "—"}</td>
                  <td>
                    {rolesOf(person.roles).some((r) => ["prescriber", "owner"].includes(r)) || person.credential ? (
                      <Link className="ws-text-link" href={`/admin/prescribers/${person.id}`}>
                        Patients & Rx
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="ws-split">
        <SectionCard title="Recent orders" flush>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Patient</th>
                  <th>Placed by</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {org.orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/admin/orders/${order.id}`}>
                        <b>{order.invoiceNumber}</b>
                      </Link>
                    </td>
                    <td>
                      {order.clinicalPatient ? (
                        <Link href={`/admin/patients/${order.clinicalPatient.id}`}>{order.clinicalPatient.fullName}</Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="muted">{order.placedBy.name}</td>
                    <td>
                      <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
                    </td>
                    <td>{money(order.totalCents)}</td>
                  </tr>
                ))}
                {!org.orders.length ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No orders.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Patients" flush>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {org.clinicalPatients.map((patient) => (
                  <tr key={patient.id}>
                    <td>
                      <Link href={`/admin/patients/${patient.id}`}>
                        <b>{patient.fullName}</b>
                      </Link>
                    </td>
                    <td className="muted">{patient.email}</td>
                  </tr>
                ))}
                {!org.clinicalPatients.length ? (
                  <tr>
                    <td colSpan={2} className="muted">
                      No clinical charts.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
