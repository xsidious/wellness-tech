import Link from "next/link";
import { notFound } from "next/navigation";
import { ClinicalChartView } from "@/components/ClinicalChartView";
import { SignaturePad } from "@/components/escript/SignaturePad";
import { PageHeader, SectionCard, StatusBadge, statusTone } from "@/components/portal/Workspace";
import { advanceOrder } from "@/lib/actions";
import { requireUser } from "@/lib/guard";
import { signEscript } from "@/lib/practice-actions";
import { prisma } from "@/lib/prisma";

const STEPS = ["received", "verified", "compounding", "shipped", "delivered", "submitted", "on_hold"];

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const order = await prisma.order.findFirst({
    where: { id: (await params).id, orgId: user.orgId },
    include: {
      lines: true,
      events: { orderBy: { createdAt: "asc" } },
      clinicalPatient: true,
      pharmacy: true,
      escripts: { orderBy: { createdAt: "desc" }, take: 3 },
    },
  });
  if (!order) notFound();

  const timelineStatus = order.status === "submitted" ? "received" : order.status;
  const pendingEscript = order.escriptStatus === "pending_signature" || order.escripts.some((e) => e.status !== "signed");

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Order"
        title={order.invoiceNumber}
        lede={`Ship to ${order.shipDestination || "PRACTICE"} · eScript ${order.escriptStatus}`}
        actions={
          <div className="ws-head-actions">
            <Link className="btn btn-ghost" href="/portal/orders">
              All orders
            </Link>
            {order.clinicalPatientId ? (
              <Link className="btn btn-ghost" href={`/portal/patients/${order.clinicalPatientId}`}>
                Patient chart
              </Link>
            ) : null}
          </div>
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
            {order.pharmacy?.name || "Unassigned"}
          </strong>
        </div>
        <div className="ws-stat">
          <span className="ws-stat-label">Tracking</span>
          <strong className="ws-stat-value" style={{ fontSize: "1.05rem" }}>
            {order.trackingNumber || "—"}
          </strong>
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
      {order.splitMessage ? <p className="note">{order.splitMessage}</p> : null}

      {pendingEscript ? (
        <SectionCard title="Sign eScript" description="Pharmacy forward is blocked until a credentialed signature is on file.">
          <form action={signEscript} className="ws-message-form">
            <input type="hidden" name="orderId" value={order.id} />
            <label>
              Directions
              <input name="directions" defaultValue="As directed by prescribing clinician." />
            </label>
            <SignaturePad />
            <button className="btn btn-accent" type="submit">
              Sign and release to pharmacy
            </button>
          </form>
        </SectionCard>
      ) : null}

      <ClinicalChartView
        chartRaw={order.clinicalChartJson || order.clinicalPatient?.clinicalChartJson}
        intakePayloadRaw={order.intakePayloadJson || order.clinicalPatient?.intakePayloadJson}
        signaturesRaw={order.signaturesJson || order.clinicalPatient?.signaturesJson}
        therapyRaw={order.therapyJson || order.clinicalPatient?.therapyJson}
        patientJson={order.patientJson}
        prescriberJson={order.prescriberJson}
        shipToJson={order.shipToJson}
        lines={order.lines}
        invoiceNumber={order.invoiceNumber}
        paymentStatus={order.paymentStatus}
        totalCents={order.totalCents}
        subtotalCents={order.subtotalCents}
        shippingFeeCents={order.shippingFeeCents}
        rxhereOrderId={order.rxhereOrderId}
        partnerExternalRef={order.partnerExternalRef}
        notes={order.notes}
      />

      <SectionCard title="Status events">
        <ul>
          {order.events.map((event) => (
            <li key={event.id}>
              {event.type} · {event.createdAt.toLocaleString()}
            </li>
          ))}
          {!order.events.length ? <li className="muted">No events yet.</li> : null}
        </ul>
        {order.status !== "delivered" ? (
          <form action={advanceOrder} className="stack" style={{ marginTop: 16 }}>
            <input type="hidden" name="orderId" value={order.id} />
            <button className="btn btn-accent">Advance sandbox fulfillment</button>
          </form>
        ) : (
          <p className="note">Delivered. Prescription lines do not post affiliate commission.</p>
        )}
      </SectionCard>
    </div>
  );
}
