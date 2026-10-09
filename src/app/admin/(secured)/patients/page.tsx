import Link from "next/link";
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
      _count: { select: { orders: true } },
    },
  });

  return (
    <>
      <div className="dash-head">
        <div>
          <p className="kicker">Clinical</p>
          <h1>Patients</h1>
          <p className="lede">All clinical charts across the network — demographics, intakes, signatures, Rx.</p>
        </div>
      </div>
      <form className="row" style={{ gap: 12, marginBottom: 16 }}>
        <input name="q" defaultValue={q} placeholder="Search name, email, KIAN ref" style={{ minWidth: 280 }} />
        <button className="btn btn-accent" type="submit">
          Search
        </button>
      </form>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Practice</th>
              <th>DOB</th>
              <th>Programs</th>
              <th>Source</th>
              <th>Orders</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {patients.map((patient) => {
              const programs = parseJsonSafe<string[]>(patient.programsJson, []);
              return (
                <tr key={patient.id}>
                  <td>
                    <b>{patient.fullName}</b>
                    <div className="muted">{patient.email}</div>
                  </td>
                  <td>
                    <Link href={`/admin/practices/${patient.orgId}`}>{patient.org.legalName}</Link>
                  </td>
                  <td>{patient.dateOfBirth || "—"}</td>
                  <td>{programs.slice(0, 2).join(" · ") || "—"}</td>
                  <td>{patient.sourceSite}</td>
                  <td>{patient._count.orders}</td>
                  <td>
                    <Link href={`/admin/patients/${patient.id}`}>Chart</Link>
                  </td>
                </tr>
              );
            })}
            {!patients.length ? (
              <tr>
                <td colSpan={7}>No patients yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
