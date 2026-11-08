import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, SectionCard, StatusBadge, statusTone } from "@/components/portal/Workspace";
import { requireUser } from "@/lib/guard";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const order = await prisma.order.findFirst({
    where: { id: (await params).id, orgId: user.orgId },
    include: { lines: true, clinicalPatient: true, pharmacy: true },
  });
  if (!order) notFound();

  return (
    <div className="ws-stack invoice-print">
      <PageHeader
        kicker="Invoice"
        title={order.invoiceNumber}
        lede={`${user.org.legalName} · ${order.createdAt.toLocaleString()}`}
        actions={
          <div className="ws-head-actions no-print">
            <Link className="btn btn-ghost" href="/portal/invoices">
              All invoices
            </Link>
            <Link className="btn btn-ghost" href={`/portal/orders/${order.id}`}>
              Fulfillment
            </Link>
            <a className="btn btn-accent" href="#print" id="print-trigger">
              Print / PDF
            </a>
          </div>
        }
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `document.getElementById('print-trigger')?.addEventListener('click',function(e){e.preventDefault();window.print();});`,
        }}
      />

      <div className="ws-stat-grid">
        <div className="ws-stat">
          <span className="ws-stat-label">Payment</span>
          <strong className="ws-stat-value" style={{ fontSize: "1.1rem" }}>
            <StatusBadge tone={statusTone(order.paymentStatus)}>{order.paymentStatus}</StatusBadge>
          </strong>
        </div>
        <div className="ws-stat">
          <span className="ws-stat-label">Fulfillment</span>
          <strong className="ws-stat-value" style={{ fontSize: "1.05rem" }}>
            <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
          </strong>
        </div>
        <div className="ws-stat">
          <span className="ws-stat-label">Card</span>
          <strong className="ws-stat-value" style={{ fontSize: "1.05rem" }}>
            {order.cardLast4 ? `•••• ${order.cardLast4}` : "—"}
          </strong>
        </div>
        <div className="ws-stat ws-stat-accent">
          <span className="ws-stat-label">Total</span>
          <strong className="ws-stat-value">{money(order.totalCents)}</strong>
        </div>
      </div>

      <div className="ws-split">
        <SectionCard title="Bill to">
          <div className="ws-kv">
            <div>
              <span>Practice</span>
              <strong>{user.org.legalName}</strong>
            </div>
            <div>
              <span>Patient</span>
              <strong>
                {order.clinicalPatient ? (
                  <Link href={`/portal/patients/${order.clinicalPatient.id}`}>{order.clinicalPatient.fullName}</Link>
                ) : (
                  "—"
                )}
              </strong>
            </div>
            <div>
              <span>Ship destination</span>
              <strong>{order.shipDestination || "—"}</strong>
            </div>
            <div>
              <span>Pharmacy</span>
              <strong>{order.pharmacy?.name || "Unassigned"}</strong>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Totals">
          <div className="ws-kv">
            <div>
              <span>Subtotal</span>
              <strong>{money(order.subtotalCents)}</strong>
            </div>
            <div>
              <span>Shipping</span>
              <strong>{money(order.shippingFeeCents)}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>{money(order.totalCents)}</strong>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Line items">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Description</th>
                <th>Class</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Line</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.sku}</td>
                  <td>{line.name}</td>
                  <td className="muted">{line.productClass}</td>
                  <td>{line.qty}</td>
                  <td>{money(line.unitPriceCents)}</td>
                  <td>{money(line.unitPriceCents * line.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
