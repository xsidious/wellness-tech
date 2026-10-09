import { prisma } from "@/lib/prisma";

export default async function AdminRefillsPage() {
  const refills = await prisma.refill.findMany({
    orderBy: { dueAt: "asc" },
    take: 200,
  });
  const orgs = await prisma.organization.findMany({
    where: { id: { in: [...new Set(refills.map((r) => r.orgId))] } },
  });
  const orgName = new Map(orgs.map((o) => [o.id, o.legalName]));

  return (
    <>
      <div className="dash-head">
        <div>
          <p className="kicker">Continuity</p>
          <h1>Refills</h1>
          <p className="lede">Due and scheduled refill queue across practices.</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Due</th>
              <th>Practice</th>
              <th>Patient</th>
              <th>Product</th>
              <th>SKU</th>
              <th>Days</th>
              <th>Autopay</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {refills.map((row) => (
              <tr key={row.id}>
                <td>{row.dueAt.toLocaleDateString()}</td>
                <td>{orgName.get(row.orgId) || row.orgId}</td>
                <td>{row.patientInitials}</td>
                <td>{row.productName}</td>
                <td>{row.productSku}</td>
                <td>{row.daysSupply}</td>
                <td>{row.autopay ? "Yes" : "No"}</td>
                <td>{row.status}</td>
              </tr>
            ))}
            {!refills.length ? (
              <tr>
                <td colSpan={8}>No refills queued.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
