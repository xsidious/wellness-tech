import { prisma } from "@/lib/prisma";

export default async function AuditPage() {
  const events = await prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <h1>Audit log</h1>
      <div className="table-wrap">
      <table className="table">
        <thead><tr><th>When</th><th>Action</th><th>Object</th><th>After</th></tr></thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}><td>{event.createdAt.toISOString()}</td><td>{event.action}</td><td>{event.object}</td><td>{event.after}</td></tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}
