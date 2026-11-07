import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PageHeader,
  SectionCard,
  StatTile,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { formatPrescriberLabel, resolveOrderPrescriber } from "@/lib/admin-clinical";
import { rolesOf } from "@/lib/guard";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function AdminPrescriberDetail({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const user = await prisma.user.findUnique({
    where: { id },
    include: { org: true, credential: true },
  });
  if (!user) notFound();

  const npi = user.credential?.npi || "";
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { placedById: user.id },
        ...(npi
          ? [
              { prescriberJson: { contains: npi } },
              { escripts: { some: { npi } } },
              { escripts: { some: { signedById: user.id } } },
            ]
          : [{ escripts: { some: { signedById: user.id } } }]),
        { lines: { some: { prescriber: { contains: user.name, mode: "insensitive" as const } } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      clinicalPatient: true,
      org: true,
      lines: true,
      placedBy: true,
      escripts: { include: { signedBy: true }, orderBy: { createdAt: "desc" }, take: 1 },
      pharmacy: true,
    },
  });

  const patientMap = new Map<string, { id: string; fullName: string; email: string; orders: number; lastAt: Date }>();
  for (const order of orders) {
    if (!order.clinicalPatient) continue;
    const existing = patientMap.get(order.clinicalPatient.id);
    if (existing) {
      existing.orders += 1;
      if (order.createdAt > existing.lastAt) existing.lastAt = order.createdAt;
    } else {
      patientMap.set(order.clinicalPatient.id, {
        id: order.clinicalPatient.id,
        fullName: order.clinicalPatient.fullName,
        email: order.clinicalPatient.email,
        orders: 1,
        lastAt: order.createdAt,
      });
    }
  }
  const patients = [...patientMap.values()].sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
  const revenue = orders.reduce((sum, o) => sum + o.totalCents, 0);
  const rxLines = orders.reduce((sum, o) => sum + o.lines.length, 0);

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Prescriber"
        title={user.credential?.displayName || user.name}
        lede={`${user.email} · ${rolesOf(user.roles).join(", ")} · ${user.org.legalName}`}
        actions={
          <Link className="btn btn-ghost" href="/admin/prescribers">
            ← All prescribers
          </Link>
        }
      />

      <div className="ws-stat-grid">
        <StatTile label="Patients brought" value={patients.length} tone="accent" hint="Unique clinical charts" />
        <StatTile label="Orders attributed" value={orders.length} />
        <StatTile label="Rx lines" value={rxLines} tone="ok" />
        <StatTile label="Attributed volume" value={money(revenue)} tone="warn" />
      </div>

      <SectionCard title="Credential">
        <div className="ws-kv">
          <div>
            <span>NPI</span>
            <strong>{user.credential?.npi || "—"}</strong>
          </div>
          <div>
            <span>Specialty</span>
            <strong>{user.credential?.specialty || "—"}</strong>
          </div>
          <div>
            <span>OIG</span>
            <strong>{user.credential?.oigStatus || "—"}</strong>
          </div>
          <div>
            <span>Practice</span>
            <strong>
              <Link href={`/admin/practices/${user.orgId}`}>{user.org.legalName}</Link>
            </strong>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Patients this clinician brought" description="Attributed via eScript, order snapshot, line, or placed-by.">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Email</th>
                <th>Orders</th>
                <th>Last order</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/admin/patients/${p.id}`}>
                      <b>{p.fullName}</b>
                    </Link>
                  </td>
                  <td className="muted">{p.email}</td>
                  <td>{p.orders}</td>
                  <td className="muted">{p.lastAt.toLocaleDateString()}</td>
                </tr>
              ))}
              {!patients.length ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No attributed patients yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Prescriptions & orders">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Patient</th>
                <th>Products</th>
                <th>Attribution</th>
                <th>eScript</th>
                <th>Status</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const rx = resolveOrderPrescriber(order);
                return (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/admin/orders/${order.id}`}>
                        <b>{order.invoiceNumber}</b>
                      </Link>
                      <div className="muted">{order.createdAt.toLocaleDateString()}</div>
                    </td>
                    <td>
                      {order.clinicalPatient ? (
                        <Link href={`/admin/patients/${order.clinicalPatient.id}`}>{order.clinicalPatient.fullName}</Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="muted">
                      {order.lines
                        .slice(0, 3)
                        .map((l) => l.name)
                        .join(" · ") || "—"}
                    </td>
                    <td>
                      <div>{formatPrescriberLabel(rx)}</div>
                      <div className="muted">{rx.source}</div>
                    </td>
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
              {!orders.length ? (
                <tr>
                  <td colSpan={7} className="muted">
                    No attributed orders yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
