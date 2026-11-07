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
import { adminAdvanceOrder } from "@/lib/actions";
import { formatPrescriberLabel, resolveOrderPrescriber } from "@/lib/admin-clinical";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function AdminOrderDetail({ params }: { params: Promise<{ id: string }> }) {
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
