import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatTile,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { requireUser } from "@/lib/guard";
import { scheduleTelehealthVisit } from "@/lib/portal-ops-actions";
import { prisma } from "@/lib/prisma";

export default async function TelehealthPage({
  searchParams,
}: {
  searchParams: Promise<{ scheduled?: string }>;
}) {
  const user = await requireUser();
  const notices = await searchParams;
  const now = new Date();
  const visits = await prisma.telehealthVisit.findMany({
    where: { orgId: user.orgId },
    orderBy: { startsAt: "asc" },
    take: 100,
  });
  const upcoming = visits.filter((v) => v.startsAt >= now && v.status === "scheduled");
  const patients = await prisma.clinicalPatient.findMany({
    where: { orgId: user.orgId },
    orderBy: { fullName: "asc" },
    take: 200,
    select: { id: true, fullName: true },
  });

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="HIPAA-secure video visits"
        title="Scheduling"
        lede="Every provider’s visits, blocked time, and open hours. Schedule a slot or start an instant visit."
      />
      {notices.scheduled ? <p className="note">Visit scheduled.</p> : null}

      <div className="ws-stat-grid">
        <StatTile label="Upcoming" value={upcoming.length} tone="accent" />
        <StatTile label="Total booked" value={visits.length} />
      </div>

      <div className="ws-split">
        <SectionCard title="New visit">
          <form action={scheduleTelehealthVisit} className="ws-message-form">
            <div className="ws-kv">
              <label>
                Patient chart
                <select name="clinicalPatientId" defaultValue="">
                  <option value="">None</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Patient name
                <input name="patientName" required />
              </label>
              <label>
                Starts at
                <input name="startsAt" type="datetime-local" required />
              </label>
              <label>
                Duration (min)
                <input name="durationMin" type="number" defaultValue={30} min={10} max={180} />
              </label>
              <label>
                Meeting URL
                <input name="meetingUrl" placeholder="https://…" />
              </label>
            </div>
            <label>
              Notes
              <textarea name="notes" rows={3} />
            </label>
            <button className="btn btn-accent" type="submit">
              Schedule visit
            </button>
          </form>
        </SectionCard>

        <SectionCard title="Calendar settings">
          <p className="muted">
            Connect Google Calendar externally for conflict blocking. Working hours and booking rules can be noted per provider in Team credentials.
          </p>
          <p className="note">Google Calendar connection ships as a follow-on OAuth integration.</p>
        </SectionCard>
      </div>

      <SectionCard title="Upcoming visits">
        {upcoming.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Patient</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th>Join</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((v) => (
                  <tr key={v.id}>
                    <td>{v.startsAt.toLocaleString()}</td>
                    <td>{v.patientName}</td>
                    <td>{v.durationMin} min</td>
                    <td>
                      <StatusBadge tone={statusTone(v.status)}>{v.status}</StatusBadge>
                    </td>
                    <td>
                      {v.meetingUrl ? (
                        <a className="ws-text-link" href={v.meetingUrl} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No upcoming telehealth appointments" body="Schedule a visit to see it on this calendar." />
        )}
      </SectionCard>
    </div>
  );
}
