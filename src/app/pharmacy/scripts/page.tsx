import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { requireUser } from "@/lib/guard";
import { resolvePharmacyScope } from "@/lib/pharmacy-scope";
import { prisma } from "@/lib/prisma";

export default async function PharmacyScriptsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const scope = await resolvePharmacyScope(user);
  const q = ((await searchParams).q || "").trim();

  const scripts = await prisma.eScript.findMany({
    where: {
      status: "signed",
      order: {
        ...scope.orderWhere,
        ...(q
          ? {
              OR: [
                { invoiceNumber: { contains: q, mode: "insensitive" } },
                { clinicalPatient: { fullName: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
    },
    orderBy: { signedAt: "desc" },
    take: 150,
    include: {
      order: { include: { org: true, lines: true } },
      clinicalPatient: true,
      signedBy: true,
    },
  });

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Clinical"
        title="eScripts for this pharmacy"
        lede="Signed prescription artifacts routed to your fulfillment book — open an order to see the full printable record."
      />

      <SectionCard title="Search">
        <form className="ws-message-form" style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <input name="q" defaultValue={q} placeholder="Invoice or patient…" style={{ minWidth: 260, flex: 1 }} />
          <button className="btn btn-accent" type="submit">
            Search
          </button>
        </form>
      </SectionCard>

      <SectionCard title={`${scripts.length} signed scripts`} flush>
        {scripts.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Prescriber</th>
                  <th>Patient</th>
                  <th>Invoice</th>
                  <th>Practice</th>
                  <th>Products</th>
                  <th>Signed</th>
                  <th>Hash</th>
                </tr>
              </thead>
              <tbody>
                {scripts.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <b>{row.displayName || row.signedBy?.name || "—"}</b>
                      <div className="muted">{row.npi ? `NPI ${row.npi}` : "—"}</div>
                    </td>
                    <td>{row.clinicalPatient?.fullName || "—"}</td>
                    <td>
                      <Link href={`/pharmacy/orders/${row.orderId}`}>
                        <b>{row.order.invoiceNumber}</b>
                      </Link>
                    </td>
                    <td>{row.order.org.legalName}</td>
                    <td className="muted">
                      {row.order.lines
                        .slice(0, 2)
                        .map((l) => l.name)
                        .join(" · ") || "—"}
                    </td>
                    <td>
                      <StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge>
                      <div className="muted">{row.signedAt ? row.signedAt.toLocaleString() : "—"}</div>
                    </td>
                    <td className="muted">{row.contentHash ? `${row.contentHash.slice(0, 10)}…` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No signed scripts yet" body="Signed eScripts for orders routed here will appear in this ledger." />
        )}
      </SectionCard>
    </div>
  );
}
