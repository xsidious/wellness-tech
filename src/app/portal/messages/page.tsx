import { PageHeader, SectionCard, EmptyState } from "@/components/portal/Workspace";
import { sendRepMessage } from "@/lib/actions";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export default async function MessagesPage() {
  const user = await requireUser();
  const messages = await prisma.message.findMany({
    where: { orgId: user.orgId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Support"
        title="Messages"
        lede={`Secure thread with your Wellness Tech representative, ${user.org.assignedRep}.`}
      />

      <div className="ws-split">
        <SectionCard title="Send a message" description="Credentialing, pricing tiers, cold-chain exceptions, and onboarding.">
          <form className="ws-message-form" action={sendRepMessage}>
            <label>
              Message
              <textarea name="body" required rows={6} placeholder="How can we help your practice?" />
            </label>
            <button className="btn btn-accent" type="submit">
              Send to {user.org.assignedRep.split(" ")[0]}
            </button>
          </form>
        </SectionCard>

        <SectionCard title="Conversation" description="Newest first.">
          {messages.length ? (
            <ul className="ws-message-list">
              {messages.map((message) => (
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
            <EmptyState title="No messages yet" body="Start the thread when you need help from your rep." />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
