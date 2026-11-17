import Link from "next/link";
import { notFound } from "next/navigation";
import { ClinicalChartView } from "@/components/ClinicalChartView";
import { EscriptDocument } from "@/components/escript/EscriptDocument";
import {
  PageHeader,
  SectionCard,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import {
  adminAdvanceOrder,
  cancelEventideOrderAction,
  refreshEventideOrderAction,
  retryEventideOrderAction,
} from "@/lib/actions";
import { formatPrescriberLabel, resolveOrderPrescriber } from "@/lib/admin-clinical";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { trackingHref } from "@/lib/tracking";

export default async function AdminOrderDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; refreshed?: string; cancelled?: string; retried?: string }>;
}) {
  const q = await searchParams;
  const order = await prisma.order.findUnique({
    where: { id: (await params).id },
    include: {
      lines: true,
      events: { orderBy: { createdAt: "asc" } },
      clinicalPatient: true,
      org: true,
      placedBy: true,
      pharmacy: true,
      escripts: { include: { signedBy: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!order) notFound();
  const rx = resolveOrderPrescriber(order);

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Order"
        title={order.invoiceNumber}
        lede={`Placed by ${order.placedBy.name} · ${order.source} · ${order.createdAt.toLocaleString()}`}
        actions={
          <div className="ws-head-actions">
            <Link className="btn btn-ghost" href="/admin/orders">
              ← Orders
            </Link>
            <Link className="btn btn-ghost" href={`/admin/practices/${order.orgId}`}>
              {order.org.legalName}
            </Link>
            {order.clinicalPatientId ? (
              <Link className="btn btn-accent" href={`/admin/patients/${order.clinicalPatientId}`}>
                Patient chart
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="ws-relation">
        <div className="ws-relation-step">
          <span>Prescriber</span>
          <strong>{formatPrescriberLabel(rx)}</strong>
          <span className="muted">{rx.source === "none" ? "unattributed" : rx.source.replace("_", " ")}</span>
        </div>
        <div className="ws-relation-step">
          <span>Patient</span>
          <strong>
            {order.clinicalPatient ? (
              <Link href={`/admin/patients/${order.clinicalPatient.id}`}>{order.clinicalPatient.fullName}</Link>
            ) : (
              "Office stock / no patient"
            )}
          </strong>
          <span className="muted">{order.clinicalPatient?.email || order.shipDestination}</span>
        </div>
        <div className="ws-relation-step">
          <span>Fulfillment</span>
          <strong>{order.pharmacy?.name || order.rxhereOrderId || "Unrouted"}</strong>
          <span className="muted">
            <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>{" "}
            <StatusBadge tone={statusTone(order.paymentStatus)}>{order.paymentStatus}</StatusBadge>
          </span>
        </div>
      </div>

      {q.error ? <p className="error">{q.error}</p> : null}
      {q.refreshed ? <p className="note">Refreshed status from VitaRelay.</p> : null}
      {q.cancelled ? <p className="note">Cancellation requested with VitaRelay.</p> : null}
      {q.retried ? <p className="note">Resubmitted to VitaRelay.</p> : null}
      {order.placementError || order.splitMessage ? (
        <p className="error">{order.placementError || order.splitMessage}</p>
      ) : null}

      <SectionCard
        title="VitaRelay tracking"
        description={
          order.lastWebhookAt
            ? `Last webhook ${order.lastWebhookAt.toLocaleString()}`
            : "No webhook received yet — use refresh to poll."
        }
      >
        <p>
          <b>Eventide order:</b> {order.rxhereOrderId || "—"}
        </p>
        <p>
          <b>Tracking:</b>{" "}
          {order.trackingNumber ? (
            trackingHref(order.trackingNumber, order.trackingUrl) ? (
              <a href={trackingHref(order.trackingNumber, order.trackingUrl)!} target="_blank" rel="noreferrer">
                {order.trackingCarrier ? `${order.trackingCarrier} · ` : ""}
                {order.trackingNumber}
              </a>
            ) : (
              order.trackingNumber
            )
          ) : (
            "—"
          )}
        </p>
        <div className="ws-head-actions" style={{ marginTop: 12, flexWrap: "wrap", gap: 8 }}>
          {(order.rxhereOrderId || order.rxcoreOrderId) &&
          !["shipped", "delivered", "cancelled"].includes(order.status) ? (
            <form action={cancelEventideOrderAction}>
              <input type="hidden" name="orderId" value={order.id} />
              <button className="btn btn-ghost" type="submit">
                Cancel before ship
              </button>
            </form>
          ) : null}
          {order.rxhereOrderId || order.rxcoreOrderId ? (
            <form action={refreshEventideOrderAction}>
              <input type="hidden" name="orderId" value={order.id} />
              <button className="btn btn-ghost" type="submit">
                Refresh from VitaRelay
              </button>
            </form>
          ) : null}
          {!order.rxhereOrderId && (order.placementError || order.status === "on_hold") ? (
            <form action={retryEventideOrderAction}>
              <input type="hidden" name="orderId" value={order.id} />
              <button className="btn btn-accent" type="submit">
                Retry placement
              </button>
            </form>
          ) : null}
        </div>
      </SectionCard>

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

      <SectionCard title="Line items" description={`Invoice total ${money(order.totalCents)}`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Prescriber (line)</th>
                <th>Sig</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <b>{line.name}</b>
                    <div className="muted">{[line.strength, line.size, line.dosageForm].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td className="muted">{line.sku}</td>
                  <td>{line.prescriber || "—"}</td>
                  <td className="muted">{line.sig || "—"}</td>
                  <td>{line.qty}</td>
                  <td>{money(line.unitPriceCents)}</td>
                  <td>
                    <StatusBadge tone={statusTone(line.lineStatus)}>{line.lineStatus}</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {order.escripts.filter((e) => e.status === "signed").map((e) => (
        <EscriptDocument
          key={e.id}
          script={{ ...e, order: { id: order.id, invoiceNumber: order.invoiceNumber }, clinicalPatient: order.clinicalPatient }}
          printHref={`/admin/prescriptions/${e.id}?print=1`}
          orderHref={`/admin/orders/${order.id}`}
          patientHref={order.clinicalPatientId ? `/admin/patients/${order.clinicalPatientId}` : undefined}
        />
      ))}

      {!order.escripts.some((e) => e.status === "signed") ? (
        <SectionCard title="eScripts on this order">
          <p className="muted">No signed eScript yet (status: {order.escriptStatus || "n/a"}).</p>
        </SectionCard>
      ) : null}

      <SectionCard title="Fulfillment events">
        <ul className="ws-steps">
          {order.events.map((event) => (
            <li key={event.id}>
              <b>{event.type}</b> · {event.createdAt.toLocaleString()}
            </li>
          ))}
          {!order.events.length ? <li className="muted">No events yet.</li> : null}
        </ul>
        {order.status !== "delivered" ? (
          <form action={adminAdvanceOrder} style={{ marginTop: 16 }}>
            <input type="hidden" name="orderId" value={order.id} />
            <button className="btn btn-accent" type="submit">
              Advance fulfillment
            </button>
          </form>
        ) : null}
      </SectionCard>
    </div>
  );
}
