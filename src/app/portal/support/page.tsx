import { EmptyState, PageHeader, SectionCard } from "@/components/portal/Workspace";
import { requireUser } from "@/lib/guard";
import { sendSupportMessage } from "@/lib/portal-ops-actions";
import { prisma } from "@/lib/prisma";

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const user = await requireUser();
  const q = await searchParams;
  const messages = await prisma.message.findMany({
    where: { orgId: user.orgId, channel: "rep" },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Help"
        title="Support & Relay assistant"
        lede={`Live chat with ${user.org.assignedRep}, plus an on-page assistant for portal how-tos.`}
      />
      {q.sent ? <p className="note">Message sent to your Wellness Tech rep.</p> : null}
      {q.error ? <p className="error">{q.error}</p> : null}

      <div className="ws-split">
        <SectionCard title="Live chat / ticket" description="Same secure thread as Messages — opens a support ticket for ops.">
          <form action={sendSupportMessage} className="ws-message-form">
            <label>
              How can we help?
              <textarea name="body" rows={5} required placeholder="Credentialing, fulfillment exception, pricing…" />
            </label>
            <button className="btn btn-accent" type="submit">
              Send to {user.org.assignedRep.split(" ")[0]}
            </button>
          </form>
        </SectionCard>

        <SectionCard title="Relay Bot" description="Quick answers from the launch checklist and portal docs.">
          <p className="muted">
            Ask about ordering, eScripts, refills, team invites, or patient portal. For account-specific PHI or payment issues, use live chat.
          </p>
          <ul>
            <li>
              <a className="ws-text-link" href="/portal/resources">
                Open launch checklist
              </a>
            </li>
            <li>
              <a className="ws-text-link" href="/portal/script-requests">
                Script requests queue
              </a>
            </li>
            <li>
              <a className="ws-text-link" href="/portal/team">
                Invite team
              </a>
            </li>
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Recent support thread">
        {messages.length ? (
          <ul className="ws-message-list">
            {messages.map((m) => (
              <li key={m.id}>
                <div className="ws-message-meta">
                  <b>{m.authorName}</b>
                  <span className="muted">{m.createdAt.toLocaleString()}</span>
                </div>
                <p>{m.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No support messages yet" body="Start a thread when you need help." />
        )}
      </SectionCard>
    </div>
  );
}
