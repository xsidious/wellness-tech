import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatTile,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { requireUser } from "@/lib/guard";
import {
  blockTelehealthTime,
  saveWorkingHours,
  scheduleTelehealthVisit,
  startInstantVisit,
} from "@/lib/portal-ops-actions";
import { prisma } from "@/lib/prisma";

function startOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default async function TelehealthPage({
  searchParams,
}: {
  searchParams: Promise<{ scheduled?: string; blocked?: string; instant?: string; hours?: string }>;
}) {
  const user = await requireUser();
  const notices = await searchParams;
  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [visits, patients, org] = await Promise.all([
    prisma.telehealthVisit.findMany({
      where: { orgId: user.orgId },
      orderBy: { startsAt: "asc" },
      take: 200,
    }),
    prisma.clinicalPatient.findMany({
      where: { orgId: user.orgId },
      orderBy: { fullName: "asc" },
      take: 200,
      select: { id: true, fullName: true },
    }),
    prisma.organization.findUnique({ where: { id: user.orgId } }),
  ]);

  const upcoming = visits.filter((v) => v.startsAt >= now && ["scheduled", "in_progress"].includes(v.status));
  const weekVisits = visits.filter((v) => v.startsAt >= weekStart && v.startsAt < weekEnd);
  const history = visits.filter((v) => v.startsAt < now || v.status === "completed").slice(-40).reverse();
  const hours = (() => {
    try {
      return JSON.parse(org?.workingHoursJson || "{}") as {
        hours?: Record<string, { open: string; close: string; enabled: boolean }>;
        visitLengthMin?: number;
        bookAheadDays?: number;
      };
    } catch {
      return {};
    }
  })();
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const instant = notices.instant ? visits.find((v) => v.id === notices.instant) : null;

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="HIPAA-secure video visits"
        title="Scheduling"
        lede="Every provider’s visits, blocked time and open hours. Click a slot workflow, start an instant visit, or set booking rules."
        actions={
          <form action={startInstantVisit}>
            <input type="hidden" name="patientName" value="Instant visit" />
            <button className="btn btn-accent" type="submit">
              Start instant visit
            </button>
          </form>
        }
      />
      {notices.scheduled ? <p className="note">Visit scheduled.</p> : null}
      {notices.blocked ? <p className="note">Time blocked.</p> : null}
      {notices.hours ? <p className="note">Working hours saved.</p> : null}
      {instant ? (
        <p className="note">
          Instant visit live —{" "}
          <a className="ws-text-link" href={instant.meetingUrl} target="_blank" rel="noreferrer">
            join room
          </a>
        </p>
      ) : null}

      <div className="ws-stat-grid">
        <StatTile label="Today / upcoming" value={upcoming.length} tone="accent" />
        <StatTile label="This week" value={weekVisits.length} />
        <StatTile label="History" value={history.length} />
      </div>

      <SectionCard title={`Week of ${weekStart.toLocaleDateString()}`} description="Scheduled · in progress · blocked">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {dayLabels.map((d, i) => {
                  const day = new Date(weekStart);
                  day.setDate(day.getDate() + i);
                  return (
                    <th key={d}>
                      {d}
                      <div className="muted">{day.getDate()}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr>
                {dayLabels.map((_, i) => {
                  const day = new Date(weekStart);
                  day.setDate(day.getDate() + i);
                  const next = new Date(day);
                  next.setDate(next.getDate() + 1);
                  const cells = weekVisits.filter((v) => v.startsAt >= day && v.startsAt < next);
                  return (
                    <td key={i} style={{ verticalAlign: "top", minWidth: 120 }}>
                      {cells.length ? (
                        cells.map((v) => (
                          <div key={v.id} style={{ marginBottom: 8 }}>
                            <StatusBadge tone={v.kind === "blocked" ? "neutral" : statusTone(v.status)}>
                              {v.kind === "blocked" ? "blocked" : v.status}
                            </StatusBadge>
                            <div>
                              <b>{v.startsAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</b>
                            </div>
                            <div className="muted">{v.patientName}</div>
                            {v.meetingUrl && v.kind !== "blocked" ? (
                              <a className="ws-text-link" href={v.meetingUrl} target="_blank" rel="noreferrer">
                                Join
                              </a>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <span className="muted">Open</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>

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
                <input name="durationMin" type="number" defaultValue={hours.visitLengthMin || 30} min={10} max={180} />
              </label>
              <label>
                Meeting URL
                <input name="meetingUrl" placeholder="Leave blank to auto-create Jitsi" />
              </label>
            </div>
            <label>
              Notes
              <textarea name="notes" rows={2} />
            </label>
            <button className="btn btn-accent" type="submit">
              Schedule visit
            </button>
          </form>
        </SectionCard>

        <SectionCard title="Block time">
          <form action={blockTelehealthTime} className="ws-message-form">
            <div className="ws-kv">
              <label>
                Starts at
                <input name="startsAt" type="datetime-local" required />
              </label>
              <label>
                Duration (min)
                <input name="durationMin" type="number" defaultValue={60} />
              </label>
            </div>
            <label>
              Reason
              <input name="notes" placeholder="Lunch / admin / travel" />
            </label>
            <button className="btn btn-ghost" type="submit">
              Block
            </button>
          </form>
        </SectionCard>
      </div>

      <SectionCard title="Working hours and booking rules">
        <form action={saveWorkingHours} className="ws-message-form">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Open</th>
                  <th>Close</th>
                  <th>Enabled</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day, i) => {
                  const row = hours.hours?.[day] || { open: "09:00", close: "17:00", enabled: i < 5 };
                  return (
                    <tr key={day}>
                      <td>{dayLabels[i]}</td>
                      <td>
                        <input name={`${day}_open`} type="time" defaultValue={row.open} />
                      </td>
                      <td>
                        <input name={`${day}_close`} type="time" defaultValue={row.close} />
                      </td>
                      <td>
                        <input type="checkbox" name={`${day}_enabled`} defaultChecked={row.enabled} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="ws-kv">
            <label>
              Default visit length (min)
              <input name="visitLengthMin" type="number" defaultValue={hours.visitLengthMin || 30} />
            </label>
            <label>
              Book ahead (days)
              <input name="bookAheadDays" type="number" defaultValue={hours.bookAheadDays || 30} />
            </label>
          </div>
          <button className="btn btn-accent" type="submit">
            Save calendar settings
          </button>
        </form>
        <p className="muted" style={{ marginTop: 12 }}>
          Google Calendar OAuth sync can be connected later via env credentials; blocked time and working hours already gate booking here.
        </p>
      </SectionCard>

      <SectionCard title="History">
        {history.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Patient</th>
                  <th>Kind</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((v) => (
                  <tr key={v.id}>
                    <td>{v.startsAt.toLocaleString()}</td>
                    <td>{v.patientName}</td>
                    <td>{v.kind}</td>
                    <td>
                      <StatusBadge tone={statusTone(v.status)}>{v.status}</StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No visit history" body="Completed and past visits appear here." />
        )}
      </SectionCard>
    </div>
  );
}
