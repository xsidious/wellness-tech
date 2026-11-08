import Link from "next/link";
import { notFound } from "next/navigation";
import { EscriptDocument } from "@/components/escript/EscriptDocument";
import { PageHeader, SectionCard, StatusBadge, statusTone } from "@/components/portal/Workspace";
import { money } from "@/lib/money";
import { requireUser } from "@/lib/guard";
import { fulfillPharmacyOrder } from "@/lib/pharmacy-actions";
import { resolvePharmacyScope } from "@/lib/pharmacy-scope";
import { prisma } from "@/lib/prisma";

export default async function PharmacyOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const scope = await resolvePharmacyScope(user);
  const order = await prisma.order.findFirst({
    where: {
      id: (await params).id,
      ...scope.orderWhere,
    },
    include: {
      org: true,
      lines: true,
      clinicalPatient: true,
      pharmacy: true,
      events: { orderBy: { createdAt: "asc" } },
      escripts: { orderBy: { createdAt: "desc" } },
      placedBy: true,
    },
  });
  if (!order) notFound();
  const signed = order.escripts.find((e) => e.status === "signed");

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Fulfill"
        title={order.invoiceNumber}
        lede={`${order.org.legalName} · ship ${order.shipDestination} · ${order.pharmacy?.name || "unassigned"}`}
        actions={
          <div className="ws-head-actions">
            <Link className="btn btn-ghost" href="/pharmacy/orders">
              ← Orders
            </Link>
            <Link className="btn btn-ghost" href="/pharmacy">
              Overview
            </Link>
          </div>
        }
      />

      <div className="ws-relation">
        <div className="ws-relation-step">
          <span>Practice</span>
          <strong>{order.org.legalName}</strong>
          <span className="muted">Placed by {order.placedBy.name}</span>
        </div>
        <div className="ws-relation-step">
          <span>Patient</span>
          <strong>{order.clinicalPatient?.fullName || "Office / no patient"}</strong>
          <span className="muted">
            {order.clinicalPatient
              ? `DOB ${order.clinicalPatient.dateOfBirth || "—"} · ${order.clinicalPatient.email}`
              : order.shipDestination}
          </span>
        </div>
        <div className="ws-relation-step">
          <span>Fulfillment</span>
          <strong>
            <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
          </strong>
          <span className="muted">{order.trackingNumber || "No tracking yet"}</span>
        </div>
      </div>

      <div className="ws-stat-grid">
        <div className="ws-stat">
          <span className="ws-stat-label">eScript</span>
          <strong className="ws-stat-value" style={{ fontSize: "1.1rem" }}>
            <StatusBadge tone={statusTone(order.escriptStatus)}>{order.escriptStatus}</StatusBadge>
          </strong>
        </div>
        <div className="ws-stat">
          <span className="ws-stat-label">Payment</span>
          <strong className="ws-stat-value" style={{ fontSize: "1.1rem" }}>
            <StatusBadge tone={statusTone(order.paymentStatus)}>{order.paymentStatus}</StatusBadge>
          </strong>
        </div>
        <div className="ws-stat ws-stat-accent">
          <span className="ws-stat-label">Total</span>
          <strong className="ws-stat-value">{money(order.totalCents)}</strong>
        </div>
      </div>

      <SectionCard title="Compounding lines">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Medication</th>
                <th>Class</th>
                <th>Qty</th>
                <th>Strength / form</th>
                <th>Patient</th>
                <th>Sig</th>
                <th>Days</th>
                <th>Line status</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.id}>
                  <td className="muted">{line.sku}</td>
                  <td>
                    <b>{line.name}</b>
                  </td>
                  <td>{line.productClass}</td>
                  <td>{line.qty}</td>
                  <td className="muted">{[line.strength, line.size, line.dosageForm].filter(Boolean).join(" · ") || "—"}</td>
                  <td>{line.patientInitials || "—"}</td>
                  <td>{line.sig || "—"}</td>
                  <td>{line.daysSupply || "—"}</td>
                  <td>
                    <StatusBadge tone={statusTone(line.lineStatus)}>{line.lineStatus}</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {signed ? (
        <EscriptDocument
          script={{
            ...signed,
            order: { id: order.id, invoiceNumber: order.invoiceNumber },
            clinicalPatient: order.clinicalPatient,
          }}
        />
      ) : (
        <SectionCard title="eScript">
          <p className="muted">
            No signed eScript on this order yet (status: {order.escriptStatus}). Pharmacy should not dispense Rx lines
            until a signed artifact is present.
          </p>
        </SectionCard>
      )}

      <SectionCard title="Ship / hold" description="Tracking writes back to Wellness Tech and the KIAN status webhook.">
        <form action={fulfillPharmacyOrder} className="ws-message-form">
          <input type="hidden" name="orderId" value={order.id} />
          <div className="ws-kv">
            <label>
              <span>Status</span>
              <select name="status" defaultValue={order.status === "on_hold" ? "compounding" : "shipped"}>
                <option value="verified">verified</option>
                <option value="compounding">compounding</option>
                <option value="shipped">shipped</option>
                <option value="delivered">delivered</option>
              </select>
            </label>
            <label>
              <span>Tracking number</span>
              <input name="trackingNumber" defaultValue={order.trackingNumber} placeholder="1Z…" />
            </label>
          </div>
          <label className="row" style={{ gap: 8, alignItems: "center" }}>
            <input type="checkbox" name="hold" />
            Place availability / clinical hold instead
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

      {order.clinicalPatient ? (
        <SectionCard title="Patient clinical notes">
          <div className="ws-kv">
            <div>
              <span>Allergies</span>
              <strong>{order.clinicalPatient.allergies || "None documented"}</strong>
            </div>
            <div>
              <span>Medications</span>
              <strong>{order.clinicalPatient.medications || "—"}</strong>
            </div>
            <div>
              <span>DOB / gender</span>
              <strong>
                {order.clinicalPatient.dateOfBirth || "—"} · {order.clinicalPatient.gender || "—"}
              </strong>
            </div>
            <div>
              <span>Phone</span>
              <strong>{order.clinicalPatient.phone || "—"}</strong>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Events">
        <ul className="ws-steps">
          {order.events.map((e) => (
            <li key={e.id}>
              <b>{e.type}</b> · {e.createdAt.toLocaleString()}
            </li>
          ))}
          {!order.events.length ? <li className="muted">No events yet.</li> : null}
        </ul>
      </SectionCard>
    </div>
  );
}
