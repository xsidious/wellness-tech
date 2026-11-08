import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ClinicalChartView } from "@/components/ClinicalChartView";
import {
  PageHeader,
  SectionCard,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { audit } from "@/lib/audit";
import { parseJsonSafe, type ClinicalSignature } from "@/lib/clinical-chart";
import { money } from "@/lib/money";
import { requireUser, rolesOf } from "@/lib/guard";
import { invitePatientPortal } from "@/lib/practice-actions";
import { prisma } from "@/lib/prisma";

export default async function PatientChartPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invited?: string }>;
}) {
  const user = await requireUser();
  const roles = rolesOf(user.roles);
  if (roles.includes("billing") && !roles.some((role) => ["owner", "prescriber", "staff", "admin"].includes(role))) {
    redirect("/portal?notice=billing");
  }

  const { id } = await params;
  const notices = await searchParams;
  const patient = await prisma.clinicalPatient.findFirst({
    where: { id, orgId: user.orgId },
    include: {
      orders: {
        orderBy: { createdAt: "desc" },
        include: { lines: true },
        take: 20,
      },
      portalUsers: { select: { id: true, passwordHash: true, lastLoginAt: true, email: true } },
    },
  });
  if (!patient) notFound();
  const portalUser = patient.portalUsers[0];
  const portalStatus = !portalUser
    ? "not invited"
    : portalUser.lastLoginAt
      ? "active"
      : "invited";

  await audit({
    actorId: user.id,
    action: "phi.read",
    object: `clinicalPatient:${patient.id}`,
    after: patient.email,
  });

  const latest = patient.orders[0] || null;
  const address = parseJsonSafe<Record<string, string>>(patient.addressJson, {});
  const programs = parseJsonSafe<string[]>(patient.programsJson, []);
  const signatures = parseJsonSafe<ClinicalSignature[]>(
    patient.signaturesJson || latest?.signaturesJson || "[]",
    [],
  );

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Patient chart"
        title={patient.fullName}
        lede={`${patient.email}${patient.phone ? ` · ${patient.phone}` : ""}`}
        actions={
          <div className="ws-head-actions">
            <Link className="btn btn-ghost" href="/portal/patients">
              All patients
            </Link>
            <form action={invitePatientPortal}>
              <input type="hidden" name="clinicalPatientId" value={patient.id} />
              <button className="btn btn-ghost" type="submit">
                {portalStatus === "not invited" ? "Invite to patient portal" : "Resend portal invite"}
              </button>
            </form>
            {latest ? (
              <Link className="btn btn-accent" href={`/portal/orders/${latest.id}`}>
                Latest order
              </Link>
            ) : null}
          </div>
        }
      />
      {notices.invited ? (
        <p className="note">Portal invite email sent to {patient.email}. Status: {portalStatus}.</p>
      ) : null}

      <div className="ws-stat-grid">
        <div className="ws-stat">
          <span className="ws-stat-label">DOB</span>
          <strong className="ws-stat-value" style={{ fontSize: "1.25rem" }}>
            {patient.dateOfBirth || "—"}
          </strong>
        </div>
        <div className="ws-stat">
          <span className="ws-stat-label">Intake</span>
          <strong className="ws-stat-value" style={{ fontSize: "1.1rem" }}>
            <StatusBadge tone={statusTone(patient.intakeStatus || "")}>
              {patient.intakeStatus || "—"}
            </StatusBadge>
          </strong>
        </div>
        <div className="ws-stat">
          <span className="ws-stat-label">Portal</span>
          <strong className="ws-stat-value" style={{ fontSize: "1.1rem" }}>
            <StatusBadge tone={portalStatus === "active" ? "ok" : portalStatus === "invited" ? "info" : "neutral"}>
              {portalStatus}
            </StatusBadge>
          </strong>
        </div>
        <div className="ws-stat ws-stat-ok">
          <span className="ws-stat-label">Signatures</span>
          <strong className="ws-stat-value">{signatures.length}</strong>
        </div>
        <div className="ws-stat ws-stat-accent">
          <span className="ws-stat-label">Orders</span>
          <strong className="ws-stat-value">{patient.orders.length}</strong>
        </div>
      </div>

      <div className="ws-split">
        <SectionCard title="Demographics">
          <div className="ws-kv">
            <div>
              <span>Gender</span>
              <strong>{patient.gender || "—"}</strong>
            </div>
            <div>
              <span>Allergies</span>
              <strong>{patient.allergies || "None recorded"}</strong>
            </div>
            <div>
              <span>Medications</span>
              <strong>{patient.medications || "None recorded"}</strong>
            </div>
            <div>
              <span>Programs</span>
              <strong>{programs.join(" · ") || "—"}</strong>
            </div>
            <div>
              <span>Source</span>
              <strong>{patient.sourceSite || "—"}</strong>
            </div>
            <div>
              <span>KIAN reference</span>
              <strong>{patient.kianReference || patient.kianIntakeId || "—"}</strong>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Address & notes">
          <div className="ws-kv">
            <div>
              <span>Street</span>
              <strong>
                {[address.street1 || address.line1, address.street2 || address.line2]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </strong>
            </div>
            <div>
              <span>City / State / ZIP</span>
              <strong>
                {[address.city, address.state, address.zip || address.postalCode]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </strong>
            </div>
            <div>
              <span>Status note</span>
              <strong>{patient.statusNote || "—"}</strong>
            </div>
          </div>
        </SectionCard>
      </div>

      {signatures.length ? (
        <SectionCard
          title="Consent & practitioner signatures"
          description="Patient and clinician signature artifacts attached to this chart."
        >
          <div className="sig-grid">
            {signatures.map((entry, index) => (
              <figure key={`${entry.label}-${index}`} className="sig-card">
                <figcaption>
                  <b>{entry.label}</b>
                  {entry.printedName ? <span>{entry.printedName}</span> : null}
                  {entry.signedAt ? <span>{new Date(entry.signedAt).toLocaleString()}</span> : null}
                </figcaption>
                {entry.kind === "image" && entry.value.startsWith("data:") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={entry.value} alt={entry.label} className="sig-image" />
                ) : (
                  <p className="sig-text">{entry.value}</p>
                )}
              </figure>
            ))}
          </div>
        </SectionCard>
      ) : null}

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
        <SectionCard title="Clinical package">
          <p className="muted">Chart saved, but no linked orders yet.</p>
        </SectionCard>
      )}

      {patient.orders.length > 1 ? (
        <SectionCard title="Order history">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {patient.orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/portal/orders/${order.id}`}>{order.invoiceNumber}</Link>
                    </td>
                    <td>
                      <StatusBadge tone={statusTone(order.status)}>{order.status}</StatusBadge>
                    </td>
                    <td>{money(order.totalCents)}</td>
                    <td className="muted">{order.createdAt.toLocaleDateString()}</td>
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
