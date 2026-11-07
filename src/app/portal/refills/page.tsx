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
import { prisma } from "@/lib/prisma";

export default async function RefillsPage() {
  const user = await requireUser();
  const refills = await prisma.refill.findMany({
    where: { orgId: user.orgId },
    orderBy: { dueAt: "asc" },
  });
  const due = refills.filter((refill) => refill.status === "due");

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Continuity"
        title="Refills"
        lede="Drafted before run-out. Approval uses the saved payment token when autopay is on — the same refill rhythm as KIAN therapeutics."
      />

      <div className="ws-stat-grid">
        <StatTile label="Due now" value={due.length} tone={due.length ? "warn" : "ok"} />
        <StatTile label="Tracked" value={refills.length} />
      </div>

      <SectionCard title="Refill queue" description="Select due rows and approve in one step.">
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
            body="Refill drafts appear when prior compound orders establish a days-supply cadence."
          />
        )}
      </SectionCard>
    </div>
  );
}
