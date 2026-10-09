import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { tierLabel } from "@/lib/rules";

export default async function AdminPracticesPage() {
  const practices = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { users: true, orders: true, clinicalPatients: true } },
    },
  });

  return (
    <>
      <div className="dash-head">
        <div>
          <p className="kicker">Network</p>
          <h1>Practices & partners</h1>
          <p className="lede">Partner clinics, operator orgs, and affiliates — verify tiers to unlock ordering.</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Practice</th>
              <th>Type</th>
              <th>Tier</th>
              <th>Status</th>
              <th>People</th>
              <th>Orders</th>
              <th>Patients</th>
              <th>Rep</th>
            </tr>
          </thead>
          <tbody>
            {practices.map((org) => (
              <tr key={org.id}>
                <td>
                  <Link href={`/admin/practices/${org.id}`}>{org.legalName}</Link>
                  <div className="muted">{org.slug}</div>
                </td>
                <td>{org.type}</td>
                <td>{tierLabel(org.verificationTier)}</td>
                <td>{org.status}</td>
                <td>{org._count.users}</td>
                <td>{org._count.orders}</td>
                <td>{org._count.clinicalPatients}</td>
                <td>{org.assignedRep || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
