import Link from "next/link";
import { notFound } from "next/navigation";
import { ClinicalChartView } from "@/components/ClinicalChartView";
import { EscriptDocument } from "@/components/escript/EscriptDocument";
import { EscriptSigningPanel } from "@/components/escript/EscriptSigningPanel";
import { PageHeader, SectionCard, StatusBadge, statusTone } from "@/components/portal/Workspace";
import { advanceOrder } from "@/lib/actions";
import { assertCanSignEscript, buildLinesSnapshot, buildPatientSnapshot } from "@/lib/escript";
import { requireUser } from "@/lib/guard";
import { signEscript } from "@/lib/practice-actions";
import { prisma } from "@/lib/prisma";
import { trackingHref } from "@/lib/tracking";

const STEPS = ["received", "verified", "compounding", "shipped", "delivered", "submitted", "on_hold"];

export default async function OrderDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; refill?: string }>;
}) {
  const user = await requireUser();
  const q = await searchParams;
  const order = await prisma.order.findFirst({
    where: { id: (await params).id, orgId: user.orgId },
    include: {
      lines: true,
      events: { orderBy: { createdAt: "asc" } },
      clinicalPatient: true,
      pharmacy: true,
      escripts: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  if (!order) notFound();

  const timelineStatus = order.status === "submitted" ? "received" : order.status;
  const signed = order.escripts.find((e) => e.status === "signed");
  const pendingEscript =
    order.escriptStatus === "pending_signature" || order.escripts.some((e) => e.status !== "signed");
  const gate = assertCanSignEscript(user);

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
            {signed ? (
              <Link className="btn btn-accent" href={`/portal/orders/${order.id}/escript`}>
                View signed Rx
              </Link>
            ) : null}
            {order.clinicalPatientId ? (
              <Link className="btn btn-ghost" href={`/portal/patients/${order.clinicalPatientId}`}>
                Patient chart
              </Link>
            ) : null}
          </div>
        }
      />

      {q.error ? <p className="error">{q.error}</p> : null}
      {q.refill === "sign" ? (
        <p className="note">Refill approved — sign the eScript below to release this order to pharmacy.</p>
      ) : null}

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
            {order.trackingNumber ? (
              trackingHref(order.trackingNumber) ? (
                <a
                  href={trackingHref(order.trackingNumber)!}
                  target="_blank"
                  rel="noreferrer"
                  className="ws-text-link"
                >
                  {order.trackingNumber}
                </a>
              ) : (
                order.trackingNumber
              )
            ) : (
              "—"
            )}
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

      {pendingEscript && !signed ? (
        <SectionCard title="Sign eScript" description="Pharmacy forward is blocked until a credentialed signature is on file." flush>
          <EscriptSigningPanel
            patient={buildPatientSnapshot(order.clinicalPatient)}
            lines={buildLinesSnapshot(order.lines)}
            canSign={gate.ok}
            gateMessage={gate.ok ? undefined : gate.error}
            signerLabel={user.credential?.displayName || user.name}
            npi={user.credential?.npi || ""}
            formAction={signEscript}
            hiddenFields={{ orderId: order.id }}
            submitLabel="Sign and release to pharmacy"
          />
        </SectionCard>
      ) : null}

      {signed ? (
        <EscriptDocument
          script={{ ...signed, order: { id: order.id, invoiceNumber: order.invoiceNumber } }}
          printHref={`/portal/orders/${order.id}/escript?print=1`}
          orderHref={`/portal/orders/${order.id}`}
          patientHref={order.clinicalPatientId ? `/portal/patients/${order.clinicalPatientId}` : undefined}
        />
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
