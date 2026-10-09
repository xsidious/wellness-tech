import Link from "next/link";
import { notFound } from "next/navigation";
import { ClinicalChartView } from "@/components/ClinicalChartView";
import { adminAdvanceOrder } from "@/lib/actions";
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
    },
  });
  if (!order) notFound();

  return (
    <>
      <div className="dash-head">
        <div>
          <p className="kicker">Admin · Order</p>
          <p className="muted">
            <Link href="/admin/orders">← All orders</Link>
            {" · "}
            <Link href={`/admin/practices/${order.orgId}`}>{order.org.legalName}</Link>
            {order.clinicalPatientId ? (
              <>
                {" · "}
                <Link href={`/admin/patients/${order.clinicalPatientId}`}>Patient chart</Link>
              </>
            ) : null}
          </p>
          <h1>{order.invoiceNumber}</h1>
          <p className="muted">
            Placed by {order.placedBy.name} · source {order.source} · {order.createdAt.toLocaleString()}
          </p>
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

      <section className="panel">
        <h2>Fulfillment events</h2>
        <ul>
          {order.events.map((event) => (
            <li key={event.id}>
              {event.type} · {event.createdAt.toLocaleString()}
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
      </section>
    </>
  );
}
