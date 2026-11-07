import Link from "next/link";
import { notFound } from "next/navigation";
import { ClinicalChartView } from "@/components/ClinicalChartView";
import {
  PageHeader,
  SectionCard,
  StatTile,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { formatPrescriberLabel, resolveOrderPrescriber } from "@/lib/admin-clinical";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function AdminPatientChart({ params }: { params: Promise<{ id: string }> }) {
  const patient = await prisma.clinicalPatient.findUnique({
    where: { id: (await params).id },
    include: {
      org: true,
      escripts: {
        orderBy: { createdAt: "desc" },
        include: { signedBy: true, order: true },
      },
      refillRequests: { orderBy: { createdAt: "desc" }, take: 20 },
      orders: {
        orderBy: { createdAt: "desc" },
        include: {
          lines: true,
          placedBy: true,
          pharmacy: true,
          escripts: { include: { signedBy: true }, orderBy: { createdAt: "desc" }, take: 1 },
        },
        take: 50,
      },
    },
  });
  if (!patient) notFound();

  const latest = patient.orders[0] || null;
  const primaryRx = latest ? resolveOrderPrescriber(latest) : null;
  const spend = patient.orders.reduce((sum, o) => sum + o.totalCents, 0);
  const lineCount = patient.orders.reduce((sum, o) => sum + o.lines.length, 0);

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Patient chart"
        title={patient.fullName}
        lede={`${patient.email} · ${patient.phone || "no phone"} · source ${patient.sourceSite}`}
        actions={
          <div className="ws-head-actions">
            <Link className="btn btn-ghost" href="/admin/patients">
              ← Patients
            </Link>
            <Link className="btn btn-ghost" href={`/admin/practices/${patient.orgId}`}>
              {patient.org.legalName}
            </Link>
          </div>
        }
      />

      <div className="ws-relation">
        <div className="ws-relation-step">
          <span>Prescriber</span>
          <strong>{primaryRx && primaryRx.source !== "none" ? formatPrescriberLabel(primaryRx) : "Unattributed"}</strong>
          {primaryRx?.email ? <span className="muted">{primaryRx.email}</span> : null}
        </div>
        <div className="ws-relation-step">
          <span>Patient</span>
          <strong>{patient.fullName}</strong>
          <span className="muted">DOB {patient.dateOfBirth || "—"}</span>
        </div>
        <div className="ws-relation-step">
          <span>Practice</span>
          <strong>
            <Link href={`/admin/practices/${patient.orgId}`}>{patient.org.legalName}</Link>
          </strong>
          <span className="muted">{patient.intakeStatus || "chart on file"}</span>
        </div>
      </div>

      <div className="ws-stat-grid">
        <StatTile label="Orders" value={patient.orders.length} tone="accent" />
        <StatTile label="Rx lines" value={lineCount} />
        <StatTile label="eScripts" value={patient.escripts.length} tone="ok" />
        <StatTile label="Lifetime" value={money(spend)} tone="warn" />
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
        <SectionCard title="Chart">
          <p className="muted">Chart exists without a linked order snapshot yet.</p>
        </SectionCard>
      )}

      <SectionCard title="Prescriptions & order history" description="Every invoice for this patient with clinician attribution.">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Prescriber</th>
                <th>Products</th>
                <th>Pharmacy</th>
                <th>eScript</th>
                <th>Status</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {patient.orders.map((order) => {
                const rx = resolveOrderPrescriber(order);
                return (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/admin/orders/${order.id}`}>
                        <b>{order.invoiceNumber}</b>
                      </Link>
                      <div className="muted">{order.createdAt.toLocaleString()}</div>
                    </td>
                    <td>
                      <b>{formatPrescriberLabel(rx)}</b>
                      <div className="muted">{rx.source}</div>
                    </td>
                    <td className="muted">
                      {order.lines.map((l) => `${l.name} ×${l.qty}`).join("; ") || "—"}
                    </td>
                    <td className="muted">{order.pharmacy?.name || order.rxhereOrderId || "—"}</td>
                    <td>
                      <StatusBadge tone={statusTone(order.escriptStatus || "n/a")}>{order.escriptStatus || "n/a"}</StatusBadge>
                    </td>
                    <td>
                      <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
                    </td>
                    <td>{money(order.totalCents)}</td>
                  </tr>
                );
              })}
              {!patient.orders.length ? (
                <tr>
                  <td colSpan={7} className="muted">
                    No orders yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="eScript records">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Prescriber</th>
                <th>NPI</th>
                <th>Invoice</th>
                <th>Status</th>
                <th>Signed</th>
              </tr>
            </thead>
            <tbody>
              {patient.escripts.map((e) => (
                <tr key={e.id}>
                  <td>{e.displayName || e.signedBy?.name || "—"}</td>
                  <td className="muted">{e.npi || "—"}</td>
                  <td>
                    <Link href={`/admin/orders/${e.orderId}`}>{e.order.invoiceNumber}</Link>
                  </td>
                  <td>
                    <StatusBadge tone={statusTone(e.status)}>{e.status}</StatusBadge>
                  </td>
                  <td className="muted">{e.signedAt ? e.signedAt.toLocaleString() : "—"}</td>
                </tr>
              ))}
              {!patient.escripts.length ? (
                <tr>
                  <td colSpan={5} className="muted">
                    No eScripts on file.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {patient.refillRequests.length ? (
        <SectionCard title="Refill requests">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Status</th>
                  <th>Requested</th>
                </tr>
              </thead>
              <tbody>
                {patient.refillRequests.map((r) => (
                  <tr key={r.id}>
                    <td>{r.productName}</td>
                    <td className="muted">{r.productSku || "—"}</td>
                    <td>
                      <StatusBadge tone={statusTone(r.status)}>{r.status}</StatusBadge>
                    </td>
                    <td className="muted">{r.createdAt.toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
