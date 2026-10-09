import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AdminMessagesPage() {
  const messages = await prisma.message.findMany({
    orderBy: { createdAt: "desc" },
    take: 150,
    include: { org: true },
  });

  return (
    <>
      <div className="dash-head">
        <div>
          <p className="kicker">Support</p>
          <h1>Messages</h1>
          <p className="lede">Practice ↔ assigned rep threads across the network.</p>
        </div>
      </div>
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
                <td>{row.createdAt.toLocaleString()}</td>
                <td>
                  <Link href={`/admin/practices/${row.orgId}`}>{row.org.legalName}</Link>
                </td>
                <td>{row.authorName}</td>
                <td>{row.body}</td>
              </tr>
            ))}
            {!messages.length ? (
              <tr>
                <td colSpan={4}>No messages yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
