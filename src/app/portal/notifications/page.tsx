import Link from "next/link";
import { EmptyState, PageHeader, SectionCard } from "@/components/portal/Workspace";
import { requireUser } from "@/lib/guard";
import { markNotificationsRead } from "@/lib/portal-ops-actions";
import { prisma } from "@/lib/prisma";

export default async function NotificationsPage() {
  const user = await requireUser();
  const rows = await prisma.appNotification.findMany({
    where: {
      orgId: user.orgId,
      OR: [{ userId: "" }, { userId: user.id }],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = rows.filter((r) => !r.readAt).length;

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Alerts"
        title="Notifications"
        lede="Order updates, refill reminders, script requests, and team events."
        actions={
          unread ? (
            <form action={markNotificationsRead}>
              <button className="btn btn-ghost" type="submit">
                Mark all read ({unread})
              </button>
            </form>
          ) : null
        }
      />

      <SectionCard title="Inbox">
        {rows.length ? (
          <ul className="ws-message-list">
            {rows.map((n) => (
              <li key={n.id}>
                <div className="ws-message-meta">
                  <b>{n.title}</b>
                  <span className="muted">{n.createdAt.toLocaleString()}</span>
                  {!n.readAt ? <span className="ws-badge ws-badge-warn">new</span> : null}
                </div>
                {n.body ? <p>{n.body}</p> : null}
                {n.href ? (
                  <Link className="ws-text-link" href={n.href}>
                    Open
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No notifications" body="Alerts appear as orders, refills, and invites move." />
        )}
      </SectionCard>
    </div>
  );
}
