import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatTile,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { money } from "@/lib/money";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export default async function PharmacyQueuePage() {
  const user = await requireUser();
  const where = {
    escriptStatus: { in: ["signed", "not_required"] },
    status: { notIn: ["delivered"] },
    ...(user.pharmacyId ? { pharmacyId: user.pharmacyId } : {}),
  };

  const [queue, held, shipped] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: 50,
      include: { org: true, clinicalPatient: true, lines: true },
    }),
    prisma.order.count({
      where: { status: "on_hold", ...(user.pharmacyId ? { pharmacyId: user.pharmacyId } : {}) },
    }),
    prisma.order.count({
      where: { status: "shipped", ...(user.pharmacyId ? { pharmacyId: user.pharmacyId } : {}) },
    }),
  ]);

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Fulfillment"
        title="Pharmacy queue"
        lede="eScript-backed orders ready to compound, ship, and sync tracking to Wellness Tech and KIAN."
      />

      <div className="ws-stat-grid">
        <StatTile label="Open queue" value={queue.length} tone="accent" />
        <StatTile label="On hold" value={held} tone="warn" />
        <StatTile label="Shipped" value={shipped} tone="ok" />
      </div>

      <SectionCard title="Ready to fulfill">
        {queue.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Practice</th>
                  <th>Patient</th>
                  <th>Ship to</th>
                  <th>Lines</th>
                  <th>eScript</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/pharmacy/orders/${order.id}`}>
                        <b>{order.invoiceNumber}</b>
                      </Link>
                    </td>
                    <td>{order.org.legalName}</td>
                    <td>{order.clinicalPatient?.fullName || order.lines.find((l) => l.patientInitials)?.patientInitials || "—"}</td>
                    <td>{order.shipDestination}</td>
                    <td>{order.lines.length}</td>
                    <td>
                      <StatusBadge tone={statusTone(order.escriptStatus)}>{order.escriptStatus}</StatusBadge>
                    </td>
                    <td>
                      <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
                    </td>
                    <td>{money(order.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Queue clear" body="New signed eScript orders land here for Eventide / network partners." />
        )}
      </SectionCard>
    </div>
  );
}
