import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatTile,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { requireUser } from "@/lib/guard";
import { money } from "@/lib/money";
import { createPatientInvoice, markPatientInvoicePaid } from "@/lib/portal-ops-actions";
import { prisma } from "@/lib/prisma";

export default async function PatientInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const user = await requireUser();
  const notices = await searchParams;
  const invoices = await prisma.patientInvoice.findMany({
    where: { orgId: user.orgId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unpaid = invoices.filter((i) => i.status !== "paid");
  const patients = await prisma.clinicalPatient.findMany({
    where: { orgId: user.orgId },
    orderBy: { fullName: "asc" },
    take: 200,
  });

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Patient billing"
        title="Patient invoices"
        lede="Bill patients for visits or procedures. They pay by secure link, or mark paid for cash/check."
      />
      {notices.created ? <p className="note">Invoice created and email sent when an address was on file.</p> : null}

      <div className="ws-stat-grid">
        <StatTile label="Invoices" value={invoices.length} />
        <StatTile label="Unpaid" value={unpaid.length} tone={unpaid.length ? "warn" : "ok"} />
      </div>

      <SectionCard title="New invoice">
        <form action={createPatientInvoice} className="ws-message-form">
          <div className="ws-kv">
            <label>
              Patient chart
              <select name="clinicalPatientId" defaultValue="">
                <option value="">—</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Patient name
              <input name="patientName" required />
            </label>
            <label>
              Email
              <input name="patientEmail" type="email" />
            </label>
            <label>
              Amount (USD)
              <input name="amount" type="number" step="0.01" min="0.01" required />
            </label>
          </div>
          <label>
            Description
            <input name="description" placeholder="Visit / procedure" />
          </label>
          <button className="btn btn-accent" type="submit">
            Create & send
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Invoice register">
        {invoices.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Patient</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <b>{inv.invoiceNumber}</b>
                      <div className="muted">{inv.description || "—"}</div>
                    </td>
                    <td>
                      {inv.patientName}
                      <div className="muted">{inv.patientEmail || "—"}</div>
                    </td>
                    <td>{money(inv.amountCents)}</td>
                    <td>
                      <StatusBadge tone={statusTone(inv.status)}>{inv.status}</StatusBadge>
                    </td>
                    <td>
                      {inv.status !== "paid" ? (
                        <form action={markPatientInvoicePaid}>
                          <input type="hidden" name="id" value={inv.id} />
                          <button className="btn btn-ghost" type="submit">
                            Mark paid
                          </button>
                        </form>
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
          <EmptyState title="No patient invoices" body="Create an invoice to send a pay link." />
        )}
      </SectionCard>
    </div>
  );
}
