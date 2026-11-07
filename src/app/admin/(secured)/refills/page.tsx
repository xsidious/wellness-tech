import Link from "next/link";
import { PageHeader, SectionCard, StatusBadge, statusTone } from "@/components/portal/Workspace";
import { prisma } from "@/lib/prisma";

export default async function AdminRefillsPage() {
  const [refills, refillRequests] = await Promise.all([
    prisma.refill.findMany({ orderBy: { dueAt: "asc" }, take: 200 }),
    prisma.refillRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { clinicalPatient: { include: { org: true } } },
    }),
  ]);
  const orgs = await prisma.organization.findMany({
    where: { id: { in: [...new Set(refills.map((r) => r.orgId))] } },
  });
  const orgName = new Map(orgs.map((o) => [o.id, o.legalName]));

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Continuity"
        title="Refills"
        lede="Scheduled refill queue and patient-requested refills across practices."
      />

      <SectionCard title={`Due / scheduled (${refills.length})`} flush>
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
                  <td>
                    <Link href={`/admin/practices/${row.orgId}`}>{orgName.get(row.orgId) || row.orgId}</Link>
                  </td>
                  <td>{row.patientInitials}</td>
                  <td>{row.productName}</td>
                  <td className="muted">{row.productSku}</td>
                  <td>{row.daysSupply}</td>
                  <td>{row.autopay ? "Yes" : "No"}</td>
                  <td>
                    <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge>
                  </td>
                </tr>
              ))}
              {!refills.length ? (
                <tr>
                  <td colSpan={8} className="muted">
                    No scheduled refills.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title={`Patient refill requests (${refillRequests.length})`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Patient</th>
                <th>Practice</th>
                <th>Product</th>
                <th>Note</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {refillRequests.map((row) => (
                <tr key={row.id}>
                  <td className="muted">{row.createdAt.toLocaleString()}</td>
                  <td>
                    <Link href={`/admin/patients/${row.clinicalPatientId}`}>
                      <b>{row.clinicalPatient.fullName}</b>
                    </Link>
                  </td>
                  <td>
                    <Link href={`/admin/practices/${row.clinicalPatient.orgId}`}>{row.clinicalPatient.org.legalName}</Link>
                  </td>
                  <td>
                    {row.productName}
                    <div className="muted">{row.productSku || "—"}</div>
                  </td>
                  <td className="muted">{row.note || "—"}</td>
                  <td>
                    <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge>
                  </td>
                </tr>
              ))}
              {!refillRequests.length ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No patient refill requests yet.
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
