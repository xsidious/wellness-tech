import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { formatPrescriberLabel, resolveOrderPrescriber } from "@/lib/admin-clinical";
import { parseJsonSafe } from "@/lib/clinical-chart";
import { prisma } from "@/lib/prisma";

export default async function AdminPatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = ((await searchParams).q || "").trim();
  const patients = await prisma.clinicalPatient.findMany({
    where: q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            { kianIntakeId: { contains: q, mode: "insensitive" } },
            { kianReference: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      org: true,
      _count: { select: { orders: true, escripts: true } },
      orders: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          placedBy: true,
          lines: true,
          escripts: { include: { signedBy: true }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Clinical network"
        title="Patients"
        lede="Every clinical chart across practices — which clinician brought them, active prescriptions, and order history."
      />

      <SectionCard title="Search">
        <form className="ws-message-form" style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <input name="q" defaultValue={q} placeholder="Search name, email, KIAN ref…" style={{ minWidth: 280, flex: 1 }} />
          <button className="btn btn-accent" type="submit">
            Search
          </button>
        </form>
      </SectionCard>

      <SectionCard title={`${patients.length} patients`} flush>
        {patients.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Prescriber</th>
                  <th>Practice</th>
                  <th>Programs</th>
                  <th>Orders</th>
                  <th>eScripts</th>
                  <th>Latest Rx status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {patients.map((patient) => {
                  const programs = parseJsonSafe<string[]>(patient.programsJson, []);
                  const latest = patient.orders[0];
                  const rx = latest ? resolveOrderPrescriber(latest) : null;
                  return (
                    <tr key={patient.id}>
                      <td>
                        <b>{patient.fullName}</b>
                        <div className="muted">{patient.email}</div>
                        <div className="muted">DOB {patient.dateOfBirth || "—"}</div>
                      </td>
                      <td>
                        {rx && rx.source !== "none" ? (
                          <>
                            <b>{formatPrescriberLabel(rx)}</b>
                            <div className="muted">{rx.source.replace("_", " ")}</div>
                          </>
                        ) : (
                          <span className="muted">Unattributed</span>
                        )}
                      </td>
                      <td>
                        <Link href={`/admin/practices/${patient.orgId}`}>{patient.org.legalName}</Link>
                        <div className="muted">{patient.sourceSite}</div>
                      </td>
                      <td>{programs.slice(0, 2).join(" · ") || "—"}</td>
                      <td>{patient._count.orders}</td>
                      <td>{patient._count.escripts}</td>
                      <td>
                        {latest ? (
                          <StatusBadge tone={statusTone(latest.escriptStatus || latest.status)}>
                            {latest.escriptStatus || latest.status}
                          </StatusBadge>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <Link className="ws-text-link" href={`/admin/patients/${patient.id}`}>
                          Open chart
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No patients found" body="Patient charts appear when partner intakes or portal orders create clinical records." />
        )}
      </SectionCard>
    </div>
  );
}
