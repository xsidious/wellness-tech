import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { formatPrescriberLabel, resolveOrderPrescriber } from "@/lib/admin-clinical";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function AdminPrescriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const query = (q || "").trim();

  const [escripts, rxOrders] = await Promise.all([
    prisma.eScript.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(query
          ? {
              OR: [
                { displayName: { contains: query, mode: "insensitive" } },
                { npi: { contains: query, mode: "insensitive" } },
                { clinicalPatient: { fullName: { contains: query, mode: "insensitive" } } },
                { order: { invoiceNumber: { contains: query, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        order: { include: { org: true, lines: true } },
        clinicalPatient: true,
        signedBy: true,
      },
    }),
    prisma.order.findMany({
      where: {
        OR: [{ escriptStatus: { not: "not_required" } }, { lines: { some: { productClass: { contains: "rx", mode: "insensitive" } } } }],
        ...(query
          ? {
              OR: [
                { invoiceNumber: { contains: query, mode: "insensitive" } },
                { clinicalPatient: { fullName: { contains: query, mode: "insensitive" } } },
                { placedBy: { name: { contains: query, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 150,
      include: {
        org: true,
        clinicalPatient: true,
        placedBy: true,
        lines: true,
        escripts: { include: { signedBy: true }, orderBy: { createdAt: "desc" }, take: 1 },
        pharmacy: true,
      },
    }),
  ]);

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Clinical"
        title="Prescriptions"
        lede="Every eScript and Rx-bearing order — who prescribed, which patient, which SKUs, and fulfillment status."
      />

      <SectionCard title="Filter">
        <form className="ws-message-form" style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <input name="q" defaultValue={query} placeholder="Patient, NPI, invoice, prescriber…" style={{ minWidth: 280 }} />
          <select name="status" defaultValue={status || ""}>
            <option value="">All eScript statuses</option>
            {["draft", "pending", "signed", "submitted", "cancelled"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button className="btn btn-accent" type="submit">
            Apply
          </button>
        </form>
      </SectionCard>

      <SectionCard title={`eScripts (${escripts.length})`} description="Signed and draft electronic prescriptions tied to orders.">
        {escripts.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Prescriber</th>
                  <th>Patient</th>
                  <th>Invoice</th>
                  <th>Practice</th>
                  <th>Lines</th>
                  <th>Status</th>
                  <th>Signed</th>
                </tr>
              </thead>
              <tbody>
                {escripts.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/admin/prescriptions/${row.id}`}>
                        <b>{row.displayName || row.signedBy?.name || "—"}</b>
                      </Link>
                      <div className="muted">{row.npi ? `NPI ${row.npi}` : row.signedBy?.email || "—"}</div>
                      {row.contentHash ? <div className="muted">hash {row.contentHash.slice(0, 12)}…</div> : null}
                    </td>
                    <td>
                      {row.clinicalPatient ? (
                        <Link href={`/admin/patients/${row.clinicalPatient.id}`}>
                          <b>{row.clinicalPatient.fullName}</b>
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <Link href={`/admin/orders/${row.orderId}`}>{row.order.invoiceNumber}</Link>
                      {" · "}
                      <Link className="ws-text-link" href={`/admin/prescriptions/${row.id}`}>
                        Open Rx
                      </Link>
                    </td>
                    <td>
                      <Link href={`/admin/practices/${row.order.orgId}`}>{row.order.org.legalName}</Link>
                    </td>
                    <td className="muted">
                      {row.order.lines
                        .slice(0, 3)
                        .map((l) => l.name)
                        .join(" · ") || "—"}
                      {row.order.lines.length > 3 ? ` +${row.order.lines.length - 3}` : ""}
                    </td>
                    <td>
                      <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge>
                    </td>
                    <td className="muted">{row.signedAt ? row.signedAt.toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No eScripts yet" body="Signed prescriptions will appear here as practices complete eScript flow." />
        )}
      </SectionCard>

      <SectionCard title={`Rx orders (${rxOrders.length})`} description="Orders that require or carry a prescription — attributed to the clinician of record.">
        {rxOrders.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Prescriber</th>
                  <th>Patient</th>
                  <th>Invoice</th>
                  <th>Practice</th>
                  <th>Products</th>
                  <th>eScript</th>
                  <th>Pharmacy</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {rxOrders.map((order) => {
                  const rx = resolveOrderPrescriber(order);
                  return (
                    <tr key={order.id}>
                      <td>
                        <b>{formatPrescriberLabel(rx)}</b>
                        <div className="muted">{rx.source === "none" ? "unattributed" : rx.source.replace("_", " ")}</div>
                      </td>
                      <td>
                        {order.clinicalPatient ? (
                          <Link href={`/admin/patients/${order.clinicalPatient.id}`}>
                            <b>{order.clinicalPatient.fullName}</b>
                          </Link>
                        ) : (
                          <span className="muted">Office / no patient</span>
                        )}
                      </td>
                      <td>
                        <Link href={`/admin/orders/${order.id}`}>
                          <b>{order.invoiceNumber}</b>
                        </Link>
                      </td>
                      <td>
                        <Link href={`/admin/practices/${order.orgId}`}>{order.org.legalName}</Link>
                      </td>
                      <td className="muted">
                        {order.lines
                          .slice(0, 2)
                          .map((l) => `${l.name} ×${l.qty}`)
                          .join("; ") || "—"}
                      </td>
                      <td>
                        <StatusBadge tone={statusTone(order.escriptStatus || "n/a")}>{order.escriptStatus || "n/a"}</StatusBadge>
                      </td>
                      <td className="muted">{order.pharmacy?.name || order.rxhereOrderId || "—"}</td>
                      <td>{money(order.totalCents)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No Rx orders" body="Compound and prescription-bearing invoices will list here with clinician attribution." />
        )}
      </SectionCard>
    </div>
  );
}
