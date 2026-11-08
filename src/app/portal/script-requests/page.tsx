import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatTile,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { requireUser } from "@/lib/guard";
import { createPrescribeRequest } from "@/lib/portal-ops-actions";
import { prisma } from "@/lib/prisma";

export default async function ScriptRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const user = await requireUser();
  const notices = await searchParams;

  const [pendingOrders, prescribeRequests, patients] = await Promise.all([
    prisma.order.findMany({
      where: { orgId: user.orgId, escriptStatus: "pending_signature" },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { clinicalPatient: true, lines: true },
    }),
    prisma.prescribeRequest.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.clinicalPatient.findMany({
      where: { orgId: user.orgId },
      orderBy: { fullName: "asc" },
      take: 200,
      select: { id: true, fullName: true },
    }),
  ]);

  const openPrescribe = prescribeRequests.filter((r) => r.status === "pending");

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Clinical release"
        title="Script Requests"
        lede="Everything waiting on a signed prescription — doctor-network requests and paid orders that need an eScript."
      />
      {notices.created ? <p className="note">Prescribe request submitted to the queue.</p> : null}

      <div className="ws-stat-grid">
        <StatTile label="Awaiting eScript" value={pendingOrders.length} tone={pendingOrders.length ? "warn" : "ok"} />
        <StatTile label="Prescribe requests" value={openPrescribe.length} tone={openPrescribe.length ? "warn" : "ok"} />
      </div>

      <SectionCard
        title={`Waiting on a prescription · ${pendingOrders.length + openPrescribe.length}`}
        description="Write or attach a signed eScript and the order moves on automatically."
      >
        {pendingOrders.length || openPrescribe.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Patient</th>
                  <th>Product / invoice</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pendingOrders.map((order) => (
                  <tr key={order.id}>
                    <td>Paid order</td>
                    <td>{order.clinicalPatient?.fullName || "—"}</td>
                    <td>
                      <b>{order.invoiceNumber}</b>
                      <div className="muted">{order.lines.map((l) => l.name).slice(0, 2).join(", ")}</div>
                    </td>
                    <td>
                      <StatusBadge tone={statusTone(order.escriptStatus)}>{order.escriptStatus}</StatusBadge>
                    </td>
                    <td>
                      <Link className="btn btn-accent" href={`/portal/orders/${order.id}`}>
                        Sign eScript
                      </Link>
                    </td>
                  </tr>
                ))}
                {prescribeRequests.map((row) => (
                  <tr key={row.id}>
                    <td>Prescribe request</td>
                    <td>{row.patientName}</td>
                    <td>
                      <b>{row.productName}</b>
                      <div className="muted">{row.note || row.productSku || "—"}</div>
                    </td>
                    <td>
                      <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge>
                    </td>
                    <td>
                      {row.clinicalPatientId ? (
                        <Link className="btn btn-ghost" href={`/portal/patients/${row.clinicalPatientId}`}>
                          Chart
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
        ) : (
          <EmptyState
            title="Nothing waiting on a script"
            body="Prescription requests and paid orders that need a script show up here."
          />
        )}
      </SectionCard>

      <SectionCard title="Request a prescription" description="Send a doctor-network style request when staff need a prescriber to write.">
        <form action={createPrescribeRequest} className="ws-message-form">
          <div className="ws-kv">
            <label>
              Patient
              <select name="clinicalPatientId" defaultValue="">
                <option value="">Free-text only</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Patient name
              <input name="patientName" required placeholder="If not selecting a chart" />
            </label>
            <label>
              Medication
              <input name="productName" required />
            </label>
            <label>
              SKU
              <input name="productSku" />
            </label>
          </div>
          <label>
            Note
            <textarea name="note" rows={3} placeholder="Sig, strength, urgency" />
          </label>
          <button className="btn btn-accent" type="submit">
            Submit request
          </button>
        </form>
      </SectionCard>
    </div>
  );
}
