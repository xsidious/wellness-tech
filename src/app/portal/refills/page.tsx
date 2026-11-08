import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatTile,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { approveRefill } from "@/lib/actions";
import { requireUser } from "@/lib/guard";
import { decidePatientRefillRequest } from "@/lib/practice-actions";
import { prisma } from "@/lib/prisma";

export default async function RefillsPage({
  searchParams,
}: {
  searchParams: Promise<{ approved?: string; declined?: string }>;
}) {
  const user = await requireUser();
  const notices = await searchParams;
  const [refills, patientRequests] = await Promise.all([
    prisma.refill.findMany({
      where: { orgId: user.orgId },
      orderBy: { dueAt: "asc" },
    }),
    prisma.refillRequest.findMany({
      where: { clinicalPatient: { orgId: user.orgId } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { clinicalPatient: true },
    }),
  ]);
  const due = refills.filter((refill) => refill.status === "due");
  const openRequests = patientRequests.filter((r) => r.status === "requested");

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Continuity"
        title="Refills"
        lede="Scheduled run-out drafts plus patient portal requests — approve before pharmacy routing."
      />
      {notices.approved ? <p className="note">Patient refill request approved — a due draft was added to the queue.</p> : null}
      {notices.declined ? <p className="note">Patient refill request declined.</p> : null}

      <div className="ws-stat-grid">
        <StatTile label="Patient requests" value={openRequests.length} tone={openRequests.length ? "warn" : "ok"} />
        <StatTile label="Due now" value={due.length} tone={due.length ? "warn" : "ok"} />
        <StatTile label="Tracked schedules" value={refills.length} />
      </div>

      <SectionCard
        title={`Patient refill requests (${openRequests.length} open)`}
        description="Submitted from the invite-only patient portal. Approve to create a due refill draft, or decline."
      >
        {patientRequests.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Patient</th>
                  <th>Product</th>
                  <th>Note</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {patientRequests.map((row) => (
                  <tr key={row.id}>
                    <td className="muted">{row.createdAt.toLocaleString()}</td>
                    <td>
                      <Link href={`/portal/patients/${row.clinicalPatientId}`}>
                        <b>{row.clinicalPatient.fullName}</b>
                      </Link>
                      <div className="muted">{row.clinicalPatient.email}</div>
                    </td>
                    <td>
                      {row.productName}
                      <div className="muted">{row.productSku || "—"}</div>
                    </td>
                    <td className="muted">{row.note || "—"}</td>
                    <td>
                      <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge>
                    </td>
                    <td>
                      {row.status === "requested" ? (
                        <div className="ws-head-actions">
                          <form action={decidePatientRefillRequest}>
                            <input type="hidden" name="id" value={row.id} />
                            <input type="hidden" name="decision" value="approved" />
                            <button className="btn btn-accent" type="submit">
                              Approve
                            </button>
                          </form>
                          <form action={decidePatientRefillRequest}>
                            <input type="hidden" name="id" value={row.id} />
                            <input type="hidden" name="decision" value="declined" />
                            <button className="btn btn-ghost" type="submit">
                              Decline
                            </button>
                          </form>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No patient requests" body="When patients submit refill requests from their portal, they appear here." />
        )}
      </SectionCard>

      <SectionCard title="Scheduled refill queue" description="Select due rows and approve in one step.">
        {refills.length ? (
          <form action={approveRefill} className="ws-stack">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Patient</th>
                    <th>Product</th>
                    <th>Due</th>
                    <th>Days</th>
                    <th>Autopay</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {refills.map((refill) => (
                    <tr key={refill.id}>
                      <td>
                        {refill.status === "due" ? (
                          <input type="checkbox" name="refillId" value={refill.id} defaultChecked />
                        ) : null}
                      </td>
                      <td>{refill.patientInitials}</td>
                      <td>
                        <b>{refill.productName}</b>
                        <div className="muted">{refill.productSku}</div>
                      </td>
                      <td>{refill.dueAt.toLocaleDateString()}</td>
                      <td>{refill.daysSupply}</td>
                      <td>{refill.autopay ? "On" : "Off"}</td>
                      <td>
                        <StatusBadge tone={statusTone(refill.status)}>{refill.status}</StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {due.length ? (
              <button className="btn btn-accent" type="submit">
                Approve selected ({due.length})
              </button>
            ) : null}
          </form>
        ) : (
          <EmptyState
            title="No refills scheduled"
            body="Refill drafts appear when prior compound orders establish a days-supply cadence, or when you approve a patient request."
          />
        )}
      </SectionCard>
    </div>
  );
}