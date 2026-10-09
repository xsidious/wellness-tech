import Link from "next/link";
import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";

export default async function AdminHome() {
  const [
    orgs,
    products,
    users,
    orders,
    patients,
    prescribers,
    affiliates,
    openRefills,
    recentOrders,
    recentPatients,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.product.count({ where: { active: true } }),
    prisma.user.count(),
    prisma.order.count(),
    prisma.clinicalPatient.count(),
    prisma.prescriberCredential.count(),
    prisma.affiliateProfile.count(),
    prisma.refill.count({ where: { status: "due" } }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { org: true, clinicalPatient: true },
    }),
    prisma.clinicalPatient.findMany({ orderBy: { updatedAt: "desc" }, take: 6 }),
  ]);

  const modules = [
    { href: "/admin/orders", label: "Orders", desc: "All partner + portal invoices and Rx charts" },
    { href: "/admin/patients", label: "Patients", desc: "Clinical charts mirrored from KIAN" },
    { href: "/admin/practices", label: "Practices", desc: "Partner clinics, tiers, and status" },
    { href: "/admin/prescribers", label: "Prescribers", desc: "NPIs and credentialed clinicians" },
    { href: "/admin/affiliates", label: "Affiliates", desc: "Referral partners and commissions" },
    { href: "/admin/products", label: "Catalog", desc: "RxHere formulary at 2× partner pricing" },
    { href: "/admin/refills", label: "Refills", desc: "Due and scheduled refill queue" },
    { href: "/admin/messages", label: "Messages", desc: "Practice ↔ rep inbox" },
    { href: "/admin/audit", label: "Audit", desc: "Immutable ops trail" },
  ];

  return (
    <div className="stack">
      <div className="dash-head">
        <div>
          <span className="kicker">Admin console</span>
          <h1>Wellness Tech operations</h1>
          <p className="lede">
            Run the network end-to-end: practices, prescribers, patients, prescriptions, catalog, and fulfillment.
          </p>
        </div>
        <div className="quick">
          <Link className="btn btn-accent" href="/admin/orders">
            Open orders
          </Link>
          <Link className="btn btn-ghost" href="/admin/products">
            Sync formulary
          </Link>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <span>Practices</span>
          <b>{orgs}</b>
        </div>
        <div className="stat">
          <span>People</span>
          <b>{users}</b>
        </div>
        <div className="stat">
          <span>Prescribers</span>
          <b>{prescribers}</b>
        </div>
        <div className="stat">
          <span>Patients</span>
          <b>{patients}</b>
        </div>
        <div className="stat">
          <span>Orders</span>
          <b>{orders}</b>
        </div>
        <div className="stat">
          <span>SKUs</span>
          <b>{products}</b>
        </div>
        <div className="stat">
          <span>Affiliates</span>
          <b>{affiliates}</b>
        </div>
        <div className="stat">
          <span>Refills due</span>
          <b>{openRefills}</b>
        </div>
      </div>

      <div className="grid-2">
        {modules.map((mod) => (
          <Link key={mod.href} href={mod.href} className="card">
            <span className="kicker">{mod.label}</span>
            <b>{mod.label}</b>
            <span className="muted">{mod.desc}</span>
          </Link>
        ))}
      </div>

      <div className="grid-2">
        <section className="panel">
          <h2>Recent orders</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Practice / patient</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/admin/orders/${order.id}`}>{order.invoiceNumber}</Link>
                    </td>
                    <td>
                      {order.org.legalName}
                      {order.clinicalPatient ? (
                        <div className="muted">{order.clinicalPatient.fullName}</div>
                      ) : null}
                    </td>
                    <td>{order.status}</td>
                    <td>{money(order.totalCents)}</td>
                  </tr>
                ))}
                {!recentOrders.length ? (
                  <tr>
                    <td colSpan={4}>No orders yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <h2>Recent patients</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Source</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentPatients.map((patient) => (
                  <tr key={patient.id}>
                    <td>
                      <Link href={`/admin/patients/${patient.id}`}>{patient.fullName}</Link>
                      <div className="muted">{patient.email}</div>
                    </td>
                    <td>{patient.sourceSite}</td>
                    <td>{patient.intakeStatus || "—"}</td>
                  </tr>
                ))}
                {!recentPatients.length ? (
                  <tr>
                    <td colSpan={3}>Charts appear when KIAN forwards paid therapy orders.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
