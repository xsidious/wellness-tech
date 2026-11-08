import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { requireUser } from "@/lib/guard";
import { requestPatientRefill, sendPatientMessage } from "@/lib/practice-actions";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function PatientPortalHome({
  searchParams,
}: {
  searchParams: Promise<{ refill?: string; sent?: string; invited?: string }>;
}) {
  const user = await requireUser("/patient/portal");
  if (!user.clinicalPatientId) redirect("/patient");
  const notices = await searchParams;

  const [patient, orders, refills, messages] = await Promise.all([
    prisma.clinicalPatient.findUnique({ where: { id: user.clinicalPatientId } }),
    prisma.order.findMany({
      where: { clinicalPatientId: user.clinicalPatientId },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { lines: true },
    }),
    prisma.refillRequest.findMany({
      where: { clinicalPatientId: user.clinicalPatientId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.message.findMany({
      where: {
        orgId: user.orgId,
        channel: "patient",
        clinicalPatientId: user.clinicalPatientId,
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);

  if (!patient) redirect("/patient");

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Invite-only"
        title={`Hi, ${patient.fullName.split(" ")[0]}`}
        lede="Prescription history, tracking, refill requests, and messages with your practice."
      />
      {notices.refill ? <p className="note">Refill request sent to your practice.</p> : null}
      {notices.sent ? <p className="note">Message sent.</p> : null}

      <SectionCard title="Prescriptions & tracking">
        {orders.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Medications</th>
                  <th>Ship to</th>
                  <th>Status</th>
                  <th>Tracking</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/patient/portal/orders/${order.id}`}>
                        <b>{order.invoiceNumber}</b>
                      </Link>
                    </td>
                    <td>{order.lines.map((l) => l.name).join(", ")}</td>
                    <td>{order.shipDestination}</td>
                    <td>
                      <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
                    </td>
                    <td className="muted">{order.trackingNumber || "—"}</td>
                    <td>{money(order.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No prescriptions yet" body="When your practice places an order linked to your chart, it appears here." />
        )}
      </SectionCard>

      <div className="ws-split" id="refills">
        <SectionCard title="Request a refill">
          <form action={requestPatientRefill} className="ws-message-form">
            <label>
              Medication
              <input name="productName" required placeholder="As on your last label" />
            </label>
            <label>
              SKU (optional)
              <input name="productSku" />
            </label>
            <label>
              Note
              <textarea name="note" rows={3} placeholder="Symptoms, timing, shipping preference" />
            </label>
            <button className="btn btn-accent" type="submit">
              Submit refill request
            </button>
          </form>
          {refills.length ? (
            <ul style={{ marginTop: 16 }}>
              {refills.map((r) => (
                <li key={r.id}>
                  {r.productName} · <StatusBadge tone={statusTone(r.status)}>{r.status}</StatusBadge> ·{" "}
                  {r.createdAt.toLocaleDateString()}
                </li>
              ))}
            </ul>
          ) : null}
        </SectionCard>

        <SectionCard title="Messages" description="Conversation with your practice concierge.">
          <div id="messages">
            <ul>
              {messages.map((m) => (
                <li key={m.id}>
                  <b>{m.authorName}</b> · {m.createdAt.toLocaleString()}
                  <div>{m.body}</div>
                </li>
              ))}
              {!messages.length ? <li className="muted">No messages yet.</li> : null}
            </ul>
            <form action={sendPatientMessage} className="ws-message-form" style={{ marginTop: 12 }}>
              <label>
                New message
                <textarea name="body" rows={3} required />
              </label>
              <button className="btn btn-accent" type="submit">
                Send
              </button>
            </form>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
