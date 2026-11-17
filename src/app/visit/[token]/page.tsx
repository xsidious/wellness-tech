import { notFound } from "next/navigation";
import { DailyRoomEmbed } from "@/components/telehealth/DailyRoomEmbed";
import { createDailyMeetingToken, dailyConfigured, hashJoinToken } from "@/lib/daily";
import { prisma } from "@/lib/prisma";

export default async function PatientVisitPage({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  if (!token || token.length < 16) notFound();
  const hash = hashJoinToken(token);
  const visit = await prisma.telehealthVisit.findFirst({
    where: {
      OR: [{ patientJoinToken: token }, { patientJoinTokenHash: hash }],
      kind: { not: "blocked" },
    },
    include: { org: { select: { legalName: true } } },
  });
  if (!visit) notFound();
  if (["cancelled", "completed", "no_show"].includes(visit.status)) {
    return (
      <main className="th-public">
        <h1>Visit closed</h1>
        <p>This telehealth visit is marked {visit.status}. Contact {visit.org.legalName} if you need help.</p>
      </main>
    );
  }

  let embedUrl = visit.meetingUrl;
  let meetingToken = "";
  if (visit.meetingRoomName && dailyConfigured()) {
    const minted = await createDailyMeetingToken({
      roomName: visit.meetingRoomName,
      userName: visit.patientName || "Patient",
      isOwner: false,
    });
    if (minted.ok) {
      embedUrl = minted.url;
      meetingToken = minted.token;
    }
  }

  return (
    <main className="th-public">
      <header className="th-public-head">
        <p className="kicker">{visit.org.legalName}</p>
        <h1>Telehealth visit</h1>
        <p>
          {visit.startsAt.toLocaleString()} · {visit.durationMin} minutes
        </p>
        <p className="muted">Waiting room enabled — your clinician will admit you when ready.</p>
      </header>
      {embedUrl ? (
        <DailyRoomEmbed roomUrl={embedUrl} token={meetingToken || undefined} userName={visit.patientName || "Patient"} />
      ) : (
        <p className="error">Meeting link is not ready yet. Refresh in a moment or contact the practice.</p>
      )}
    </main>
  );
}
