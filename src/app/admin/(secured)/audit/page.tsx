import { PageHeader, SectionCard } from "@/components/portal/Workspace";
import { prisma } from "@/lib/prisma";

export default async function AuditPage() {
  const events = await prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 150 });
  return (
    <div className="ws-stack">
      <PageHeader kicker="System" title="Audit log" lede="Operator actions, auth events, and object mutations." />
      <SectionCard title={`${events.length} events`} flush>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Object</th>
                <th>After</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="muted">{event.createdAt.toLocaleString()}</td>
                  <td>
                    <b>{event.action}</b>
                  </td>
                  <td>{event.object}</td>
                  <td className="muted" style={{ maxWidth: 420, overflowWrap: "anywhere" }}>
                    {event.after}
                  </td>
                </tr>
              ))}
              {!events.length ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No audit events yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
