import Link from "next/link";
import { notFound } from "next/navigation";
import { ClinicalChartView } from "@/components/ClinicalChartView";
import { prisma } from "@/lib/prisma";

export default async function AdminPatientChart({ params }: { params: Promise<{ id: string }> }) {
  const patient = await prisma.clinicalPatient.findUnique({
    where: { id: (await params).id },
    include: {
      org: true,
      orders: {
        orderBy: { createdAt: "desc" },
        include: { lines: true },
        take: 25,
      },
    },
  });
  if (!patient) notFound();
  const latest = patient.orders[0] || null;

  return (
    <>
      <div className="dash-head">
        <div>
          <p className="kicker">Admin · Patient</p>
          <p className="muted">
            <Link href="/admin/patients">← Patients</Link>
            {" · "}
            <Link href={`/admin/practices/${patient.orgId}`}>{patient.org.legalName}</Link>
          </p>
          <h1>{patient.fullName}</h1>
          <p className="muted">
            {patient.email} · {patient.phone || "no phone"} · source {patient.sourceSite}
          </p>
        </div>
      </div>

      {latest ? (
        <ClinicalChartView
          chartRaw={patient.clinicalChartJson || latest.clinicalChartJson}
          intakePayloadRaw={patient.intakePayloadJson || latest.intakePayloadJson}
          signaturesRaw={patient.signaturesJson || latest.signaturesJson}
          therapyRaw={patient.therapyJson || latest.therapyJson}
          patientJson={latest.patientJson}
          prescriberJson={latest.prescriberJson}
          shipToJson={latest.shipToJson}
          lines={latest.lines}
          invoiceNumber={latest.invoiceNumber}
          paymentStatus={latest.paymentStatus}
          totalCents={latest.totalCents}
          subtotalCents={latest.subtotalCents}
          shippingFeeCents={latest.shippingFeeCents}
          rxhereOrderId={latest.rxhereOrderId}
          partnerExternalRef={latest.partnerExternalRef}
          notes={latest.notes}
        />
      ) : (
        <section className="panel">
          <p className="muted">Chart exists without a linked order snapshot yet.</p>
        </section>
      )}

      {patient.orders.length ? (
        <section className="panel">
          <h2>Order history</h2>
          <ul>
            {patient.orders.map((order) => (
              <li key={order.id}>
                <Link href={`/admin/orders/${order.id}`}>{order.invoiceNumber}</Link>
                {" · "}
                {order.status} · {order.createdAt.toLocaleDateString()}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
