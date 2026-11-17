import Link from "next/link";
import { notFound } from "next/navigation";
import { DailyRoomEmbed } from "@/components/telehealth/DailyRoomEmbed";
import { PageHeader, StatusBadge, statusTone } from "@/components/portal/Workspace";
import { createDailyMeetingToken, dailyConfigured } from "@/lib/daily";
import { requireUser, rolesOf } from "@/lib/guard";
import { updateTelehealthVisitStatus } from "@/lib/portal-ops-actions";
import { prisma } from "@/lib/prisma";

export default async function TelehealthRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const roles = rolesOf(user.roles);
  if (!roles.some((r) => ["owner", "prescriber", "staff", "admin"].includes(r))) notFound();
  const id = (await params).id;
  const visit = await prisma.telehealthVisit.findFirst({
    where: { id, orgId: user.orgId },
  });
  if (!visit || visit.kind === "blocked") notFound();

  let embedUrl = visit.meetingUrl;
  let token = "";
  if (visit.meetingRoomName && dailyConfigured()) {
    const minted = await createDailyMeetingToken({
      roomName: visit.meetingRoomName,
      userName: user.name || "Provider",
      isOwner: true,
    });
    if (minted.ok) {
      embedUrl = minted.url;
      token = minted.token;
    }
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://www.wellnesstechdistribution.com").replace(/\/$/, "");
  const patientLink = visit.patientJoinToken ? `${appUrl}/visit/${visit.patientJoinToken}` : "";

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Telehealth room"
        title={visit.patientName || "Visit"}
        lede={`${visit.startsAt.toLocaleString()} · ${visit.durationMin} min`}
        actions={
          <div className="ws-head-actions">
            <StatusBadge tone={statusTone(visit.status)}>{visit.status}</StatusBadge>
            <Link className="btn btn-ghost" href="/portal/telehealth">
              Back
            </Link>
          </div>
        }
      />

      {patientLink ? (
        <p className="note">
          Patient join link:{" "}
          <a className="ws-text-link" href={patientLink} target="_blank" rel="noreferrer">
            {patientLink}
          </a>
        </p>
      ) : null}

      {embedUrl ? (
        <DailyRoomEmbed roomUrl={embedUrl} token={token || undefined} userName={user.name} />
      ) : (
        <p className="error">No meeting room yet. Reschedule the visit to provision Daily/Jitsi.</p>
      )}

      <div className="ws-head-actions">
        <form action={updateTelehealthVisitStatus}>
          <input type="hidden" name="id" value={visit.id} />
          <input type="hidden" name="status" value="in_progress" />
          <button className="btn btn-accent" type="submit">
            Mark in progress
          </button>
        </form>
        <form action={updateTelehealthVisitStatus}>
          <input type="hidden" name="id" value={visit.id} />
          <input type="hidden" name="status" value="completed" />
          <button className="btn btn-ghost" type="submit">
            Complete
          </button>
        </form>
        <form action={updateTelehealthVisitStatus}>
          <input type="hidden" name="id" value={visit.id} />
          <input type="hidden" name="status" value="no_show" />
          <button className="btn btn-ghost" type="submit">
            No-show
          </button>
        </form>
        <form action={updateTelehealthVisitStatus}>
          <input type="hidden" name="id" value={visit.id} />
          <input type="hidden" name="status" value="cancelled" />
          <button className="btn btn-ghost" type="submit">
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}
