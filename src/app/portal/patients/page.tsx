import Link from "next/link";
import { redirect } from "next/navigation";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatTile,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { audit } from "@/lib/audit";
import { parseJsonSafe } from "@/lib/clinical-chart";
import { requireUser, rolesOf } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export default async function PatientsPage() {
  const user = await requireUser();
  const roles = rolesOf(user.roles);
  if (roles.includes("billing") && !roles.some((role) => ["owner", "prescriber", "staff", "admin"].includes(role))) {
    redirect("/portal?notice=billing");
  }

  const [clinicalPatients, legacy] = await Promise.all([
    prisma.clinicalPatient.findMany({
      where: { orgId: user.orgId },
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: { _count: { select: { orders: true } } },
    }),
    prisma.patientRef.findMany({ where: { orgId: user.orgId }, take: 50 }),
  ]);

  await audit({
    actorId: user.id,
    action: "phi.read",
    object: `patients:${user.orgId}`,
    after: `${clinicalPatients.length} charts`,
  });

  const withSigs = clinicalPatients.filter((p) => {
    const sigs = parseJsonSafe<unknown[]>(p.signaturesJson, []);
    return sigs.length > 0;
  }).length;

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Clinical"
        title="Patients"
        lede="Charts from KIAN handoff or in-portal intake — demographics, prescriptions, consents, and signatures."
        actions={
          <Link className="btn btn-accent" href="/portal/patients/new">
            New intake
          </Link>
        }
      />

      <div className="ws-stat-grid">
        <StatTile label="Charts" value={clinicalPatients.length} tone="accent" />
        <StatTile label="With signatures" value={withSigs} tone="ok" />
        <StatTile label="Legacy refs" value={legacy.length} />
      </div>

      <SectionCard title="Clinical charts" description="Open a chart for full patient details, therapy lines, and signature images.">
        {clinicalPatients.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>DOB</th>
                  <th>Programs</th>
                  <th>Status</th>
                  <th>Orders</th>
                  <th>Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clinicalPatients.map((patient) => {
                  const programs = parseJsonSafe<string[]>(patient.programsJson, []);
                  const sigs = parseJsonSafe<unknown[]>(patient.signaturesJson, []);
                  return (
                    <tr key={patient.id}>
                      <td>
                        <b>{patient.fullName}</b>
                        <div className="muted">{patient.email}</div>
                        {patient.phone ? <div className="muted">{patient.phone}</div> : null}
                        {sigs.length ? (
                          <div className="ws-chip-row" style={{ marginTop: 6 }}>
                            <span className="ws-chip">{sigs.length} signature{sigs.length === 1 ? "" : "s"}</span>
                          </div>
                        ) : null}
                      </td>
                      <td>{patient.dateOfBirth || "—"}</td>
                      <td>{programs.slice(0, 3).join(" · ") || "—"}</td>
                      <td>
                        <StatusBadge tone={statusTone(patient.intakeStatus || "")}>
                          {patient.intakeStatus || "—"}
                        </StatusBadge>
                      </td>
                      <td>{patient._count.orders}</td>
                      <td className="muted">{patient.updatedAt.toLocaleDateString()}</td>
                      <td>
                        <Link className="btn btn-ghost" href={`/portal/patients/${patient.id}`}>
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
          <EmptyState
            title="No clinical charts yet"
            body="Charts appear when KIAN forwards a paid therapy order, or when a practice order links a patient."
            action={
              <Link className="btn btn-accent" href="/portal/catalog">
                Place an order
              </Link>
            }
          />
        )}
      </SectionCard>

      {legacy.length ? (
        <SectionCard title="Legacy RxCore initials" description="Older patient reference rows kept for continuity.">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Initials</th>
                  <th>RxCore id</th>
                </tr>
              </thead>
              <tbody>
                {legacy.map((patient) => (
                  <tr key={patient.id}>
                    <td>{patient.initials}</td>
                    <td>{patient.rxcorePatientId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
