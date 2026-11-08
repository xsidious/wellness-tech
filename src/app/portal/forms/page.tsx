import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatusBadge,
  statusTone,
} from "@/components/portal/Workspace";
import { requireUser } from "@/lib/guard";
import { createPracticeForm } from "@/lib/portal-ops-actions";
import { prisma } from "@/lib/prisma";

export default async function FormsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const user = await requireUser();
  const notices = await searchParams;
  const forms = await prisma.practiceForm.findMany({
    where: { orgId: user.orgId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { submissions: true } } },
  });

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Patients"
        title="Forms"
        lede="Intake, consent, and follow-up forms for your clinic. Share links and track submissions."
      />
      {notices.created ? <p className="note">Form created with required clinical questions.</p> : null}

      <SectionCard title="New form">
        <form action={createPracticeForm} className="ws-message-form" style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <input name="title" placeholder="Form title" required style={{ minWidth: 220 }} />
          <select name="kind" defaultValue="intake">
            <option value="intake">Intake</option>
            <option value="consent">Consent</option>
            <option value="followup">Follow-up</option>
          </select>
          <button className="btn btn-accent" type="submit">
            Create form
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Practice forms">
        {forms.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Kind</th>
                  <th>Submissions</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {forms.map((form) => (
                  <tr key={form.id}>
                    <td>
                      <b>{form.title}</b>
                    </td>
                    <td>{form.kind}</td>
                    <td>{form._count.submissions}</td>
                    <td>
                      <StatusBadge tone={form.active ? "ok" : "neutral"}>{form.active ? "active" : "off"}</StatusBadge>
                    </td>
                    <td className="muted">{form.updatedAt.toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No forms yet"
            body="Start from intake or follow-up — required clinical questions stay in place; wording and extras are yours."
          />
        )}
      </SectionCard>
    </div>
  );
}
