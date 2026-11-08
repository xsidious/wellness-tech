import Link from "next/link";
import { PageHeader, SectionCard, EmptyState, StatusBadge } from "@/components/portal/Workspace";
import { sendRepMessage } from "@/lib/actions";
import { requireUser } from "@/lib/guard";
import { markPatientMessagesRead, replyPatientMessage } from "@/lib/practice-actions";
import { prisma } from "@/lib/prisma";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string; sent?: string; error?: string }>;
}) {
  const user = await requireUser();
  const q = await searchParams;

  const [repMessages, patientMessages, patients] = await Promise.all([
    prisma.message.findMany({
      where: { orgId: user.orgId, channel: "rep" },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.message.findMany({
      where: { orgId: user.orgId, channel: "patient" },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { clinicalPatient: true },
    }),
    prisma.clinicalPatient.findMany({
      where: { orgId: user.orgId },
      orderBy: { fullName: "asc" },
      take: 200,
      select: { id: true, fullName: true, email: true },
    }),
  ]);

  const unreadByPatient = new Map<string, number>();
  for (const msg of patientMessages) {
    if (!msg.clinicalPatientId || msg.readAt || msg.authorUserId === user.id) continue;
    unreadByPatient.set(msg.clinicalPatientId, (unreadByPatient.get(msg.clinicalPatientId) || 0) + 1);
  }

  const selectedPatientId = q.patient || [...unreadByPatient.keys()][0] || patients[0]?.id || "";
  const thread = patientMessages.filter((m) => m.clinicalPatientId === selectedPatientId);
  const selectedPatient = patients.find((p) => p.id === selectedPatientId);

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Support"
        title="Messages"
        lede={`Rep thread with ${user.org.assignedRep}, plus patient-portal conversations scoped per chart.`}
      />
      {q.sent ? <p className="note">Message sent.</p> : null}
      {q.error ? <p className="error">{q.error}</p> : null}

      <div className="ws-split">
        <SectionCard title="Send to your rep" description="Credentialing, pricing tiers, cold-chain exceptions, and onboarding.">
          <form className="ws-message-form" action={sendRepMessage}>
            <label>
              Message
              <textarea name="body" required rows={5} placeholder="How can we help your practice?" />
            </label>
            <button className="btn btn-accent" type="submit">
              Send to {user.org.assignedRep.split(" ")[0]}
            </button>
          </form>
          <div style={{ marginTop: 18 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: "0.95rem" }}>Rep conversation</h3>
            {repMessages.length ? (
              <ul className="ws-message-list">
                {repMessages.map((message) => (
                  <li key={message.id}>
                    <div className="ws-message-meta">
                      <b>{message.authorName}</b>
                      <span className="muted">{message.createdAt.toLocaleString()}</span>
                    </div>
                    <p>{message.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No rep messages yet" body="Start the thread when you need help from your rep." />
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Patient portal inbox"
          description="Messages patients send from their invite-only portal."
          action={
            unreadByPatient.size ? (
              <StatusBadge tone="warn">{unreadByPatient.size} unread thread{unreadByPatient.size === 1 ? "" : "s"}</StatusBadge>
            ) : null
          }
        >
          {patients.length ? (
            <div className="ws-stack">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Patient</th>
                      <th>Unread</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {patients
                      .filter((p) => patientMessages.some((m) => m.clinicalPatientId === p.id) || p.id === selectedPatientId)
                      .slice(0, 40)
                      .map((p) => (
                        <tr key={p.id}>
                          <td>
                            <b>{p.fullName}</b>
                            <div className="muted">{p.email}</div>
                          </td>
                          <td>{unreadByPatient.get(p.id) || 0}</td>
                          <td>
                            <Link className="btn btn-ghost" href={`/portal/messages?patient=${p.id}`}>
                              Open
                            </Link>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {selectedPatient ? (
                <div>
                  <div className="ws-head-actions" style={{ marginBottom: 10 }}>
                    <h3 style={{ margin: 0, fontSize: "1rem" }}>Thread · {selectedPatient.fullName}</h3>
                    {(unreadByPatient.get(selectedPatient.id) || 0) > 0 ? (
                      <form action={markPatientMessagesRead}>
                        <input type="hidden" name="clinicalPatientId" value={selectedPatient.id} />
                        <button className="btn btn-ghost" type="submit">
                          Mark read
                        </button>
                      </form>
                    ) : null}
                  </div>
                  <ul className="ws-message-list">
                    {thread.map((message) => (
                      <li key={message.id}>
                        <div className="ws-message-meta">
                          <b>{message.authorName}</b>
                          <span className="muted">{message.createdAt.toLocaleString()}</span>
                          {!message.readAt && message.authorUserId !== user.id ? (
                            <StatusBadge tone="warn">new</StatusBadge>
                          ) : null}
                        </div>
                        <p>{message.body}</p>
                      </li>
                    ))}
                    {!thread.length ? <li className="muted">No messages in this thread yet.</li> : null}
                  </ul>
                  <form action={replyPatientMessage} className="ws-message-form" style={{ marginTop: 12 }}>
                    <input type="hidden" name="clinicalPatientId" value={selectedPatient.id} />
                    <label>
                      Reply to patient
                      <textarea name="body" rows={3} required placeholder="Clinical or logistics reply" />
                    </label>
                    <button className="btn btn-accent" type="submit">
                      Send reply
                    </button>
                  </form>
                </div>
              ) : (
                <p className="muted">Select a patient thread to reply.</p>
              )}
            </div>
          ) : (
            <EmptyState title="No patients yet" body="Patient messages appear after charts exist and patients are invited." />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
