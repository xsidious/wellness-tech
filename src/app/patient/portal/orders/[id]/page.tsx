import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader, SectionCard, StatusBadge, statusTone } from "@/components/portal/Workspace";
import { requireUser } from "@/lib/guard";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { trackingHref } from "@/lib/tracking";

const STEPS = ["received", "verified", "compounding", "shipped", "delivered", "submitted", "on_hold"];

export default async function PatientOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("/patient/portal");
  if (!user.clinicalPatientId) redirect("/patient");

  const order = await prisma.order.findFirst({
    where: { id: (await params).id, clinicalPatientId: user.clinicalPatientId },
    include: {
      lines: true,
      events: { orderBy: { createdAt: "asc" } },
      pharmacy: true,
    },
  });
  if (!order) notFound();

  const timelineStatus = order.status === "submitted" ? "received" : order.status;
  const trackUrl = trackingHref(order.trackingNumber);

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Prescription"
        title={order.invoiceNumber}
        lede={`Ship to ${order.shipDestination || "your address"} · ${order.status}`}
        actions={
          <Link className="btn btn-ghost" href="/patient/portal">
            All prescriptions
          </Link>
        }
      />

      <div className="ws-stat-grid">
        <div className="ws-stat">
          <span className="ws-stat-label">Status</span>
          <strong className="ws-stat-value" style={{ fontSize: "1.1rem" }}>
            <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
          </strong>
        </div>
        <div className="ws-stat">
          <span className="ws-stat-label">Pharmacy</span>
          <strong className="ws-stat-value" style={{ fontSize: "1.05rem" }}>
            {order.pharmacy?.name || "Assigned partner"}
          </strong>
        </div>
        <div className="ws-stat">
          <span className="ws-stat-label">Tracking</span>
          <strong className="ws-stat-value" style={{ fontSize: "1.05rem" }}>
            {order.trackingNumber ? (
              trackUrl ? (
                <a href={trackUrl} target="_blank" rel="noreferrer" className="ws-text-link">
                  {order.trackingNumber}
                </a>
              ) : (
                order.trackingNumber
              )
            ) : (
              "Pending"
            )}
          </strong>
        </div>
        <div className="ws-stat">
          <span className="ws-stat-label">Total</span>
          <strong className="ws-stat-value">{money(order.totalCents)}</strong>
        </div>
      </div>

      <div className="timeline">
        {["received", "verified", "compounding", "shipped", "delivered"].map((step) => (
          <span
            key={step}
            className={
              STEPS.indexOf(timelineStatus) >= STEPS.indexOf(step) || order.status === "delivered" ? "on" : ""
            }
          >
            {step}
          </span>
        ))}
      </div>

      <SectionCard title="Medications">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Medication</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <b>{line.name}</b>
                    <div className="muted">{line.sku}</div>
                  </td>
                  <td>{line.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {order.events.length ? (
        <SectionCard title="Updates">
          <ul className="ws-message-list">
            {order.events.map((event) => (
              <li key={event.id}>
                <div className="ws-message-meta">
                  <b>{event.type}</b>
                  <span className="muted">{event.createdAt.toLocaleString()}</span>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard title="Need a refill?">
        <p className="muted">Request a refill from your patient home — your practice reviews before pharmacy routing.</p>
        <Link className="btn btn-accent" href="/patient/portal#refills">
          Request refill
        </Link>
      </SectionCard>
    </div>
  );
}
