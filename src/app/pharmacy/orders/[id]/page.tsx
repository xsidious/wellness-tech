import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, SectionCard, StatusBadge, statusTone } from "@/components/portal/Workspace";
import { money } from "@/lib/money";
import { requireUser } from "@/lib/guard";
import { fulfillPharmacyOrder } from "@/lib/pharmacy-actions";
import { prisma } from "@/lib/prisma";

export default async function PharmacyOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const order = await prisma.order.findFirst({
    where: {
      id: (await params).id,
      ...(user.pharmacyId ? { pharmacyId: user.pharmacyId } : {}),
    },
    include: { org: true, lines: true, clinicalPatient: true, events: { orderBy: { createdAt: "asc" } }, escripts: true },
  });
  if (!order) notFound();

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Fulfill"
        title={order.invoiceNumber}
        lede={`${order.org.legalName} · ship ${order.shipDestination}`}
        actions={
          <Link className="btn btn-ghost" href="/pharmacy">
            Back to queue
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
          <span className="ws-stat-label">eScript</span>
          <strong className="ws-stat-value" style={{ fontSize: "1.1rem" }}>
            <StatusBadge tone={statusTone(order.escriptStatus)}>{order.escriptStatus}</StatusBadge>
          </strong>
        </div>
        <div className="ws-stat ws-stat-accent">
          <span className="ws-stat-label">Total</span>
          <strong className="ws-stat-value">{money(order.totalCents)}</strong>
        </div>
      </div>

      <SectionCard title="Lines">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Class</th>
                <th>Qty</th>
                <th>Patient</th>
                <th>Sig</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.sku}</td>
                  <td>{line.name}</td>
                  <td>{line.productClass}</td>
                  <td>{line.qty}</td>
                  <td>{line.patientInitials || "—"}</td>
                  <td className="muted">{line.sig || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Ship / hold" description="Tracking writes back to the order and KIAN status webhook.">
        <form action={fulfillPharmacyOrder} className="ws-message-form">
          <input type="hidden" name="orderId" value={order.id} />
          <label>
            Status
            <select name="status" defaultValue="shipped">
              <option value="compounding">compounding</option>
              <option value="shipped">shipped</option>
              <option value="delivered">delivered</option>
            </select>
          </label>
          <label>
            Tracking number
            <input name="trackingNumber" defaultValue={order.trackingNumber} placeholder="1Z…" />
          </label>
          <label className="row" style={{ gap: 8, alignItems: "center" }}>
            <input type="checkbox" name="hold" />
            Place availability hold instead
          </label>
          <label>
            Hold reason
            <input name="holdReason" placeholder="Out of stock / clinical clarification" />
          </label>
          <button className="btn btn-accent" type="submit">
            Update fulfillment
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Events">
        <ul>
          {order.events.map((e) => (
            <li key={e.id}>
              {e.type} · {e.createdAt.toLocaleString()}
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
