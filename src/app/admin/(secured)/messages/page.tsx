import Link from "next/link";
import { EmptyState, PageHeader, SectionCard } from "@/components/portal/Workspace";
import { prisma } from "@/lib/prisma";

export default async function AdminMessagesPage() {
  const messages = await prisma.message.findMany({
    orderBy: { createdAt: "desc" },
    take: 150,
    include: { org: true },
  });

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Support"
        title="Messages"
        lede="Practice ↔ assigned rep threads across the network."
      />
      <SectionCard title={`${messages.length} recent`} flush>
        {messages.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Practice</th>
                  <th>From</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((row) => (
                  <tr key={row.id}>
                    <td className="muted">{row.createdAt.toLocaleString()}</td>
                    <td>
                      <Link href={`/admin/practices/${row.orgId}`}>{row.org.legalName}</Link>
                    </td>
                    <td>{row.authorName}</td>
                    <td>{row.body}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No messages" body="Practice support threads will appear here." />
        )}
      </SectionCard>
    </div>
  );
}
