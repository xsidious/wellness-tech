import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, SectionCard, StatusBadge, statusTone } from "@/components/portal/Workspace";
import { requireUser } from "@/lib/guard";
import { updatePracticeForm } from "@/lib/portal-ops-actions";
import { prisma } from "@/lib/prisma";

type Field = { id: string; label: string; type: string; required?: boolean };

export default async function FormEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const notices = await searchParams;
  const form = await prisma.practiceForm.findFirst({
    where: { id, orgId: user.orgId },
    include: { submissions: { orderBy: { createdAt: "desc" }, take: 50 } },
  });
  if (!form) notFound();
  const fields = (JSON.parse(form.schemaJson || "[]") as Field[]).length
    ? (JSON.parse(form.schemaJson || "[]") as Field[])
    : [
        { id: "f1", label: "Full name", type: "text", required: true },
        { id: "f2", label: "Date of birth", type: "date", required: true },
      ];
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://www.wellnesstechdistribution.com").replace(/\/$/, "");

  return (
    <div className="ws-stack">
      <PageHeader
        kicker={form.kind}
        title={form.title}
        lede="Edit questions, toggle active, and review submissions."
        actions={
          <div className="ws-head-actions">
            <Link className="btn btn-ghost" href="/portal/forms">
              All forms
            </Link>
            <a className="btn btn-accent" href={`/f/${form.id}`} target="_blank" rel="noreferrer">
              Open public form
            </a>
          </div>
        }
      />
      {notices.saved ? <p className="note">Form saved.</p> : null}
      <p className="muted">
        Share link: <code>{appUrl}/f/{form.id}</code>
      </p>

      <SectionCard title="Questions">
        <form action={updatePracticeForm} className="ws-message-form">
          <input type="hidden" name="id" value={form.id} />
          <div className="ws-kv">
            <label>
              Title
              <input name="title" defaultValue={form.title} required />
            </label>
            <label>
              Kind
              <select name="kind" defaultValue={form.kind}>
                <option value="intake">Intake</option>
                <option value="consent">Consent</option>
                <option value="followup">Follow-up</option>
              </select>
            </label>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" name="active" defaultChecked={form.active} />
            Active
          </label>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Type</th>
                  <th>Required</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field) => (
                  <tr key={field.id}>
                    <td>
                      <input name="fieldTitle" defaultValue={field.label} required />
                    </td>
                    <td>
                      <select name="fieldType" defaultValue={field.type}>
                        <option value="text">Text</option>
                        <option value="date">Date</option>
                        <option value="textarea">Textarea</option>
                        <option value="checkbox">Checkbox</option>
                        <option value="email">Email</option>
                        <option value="phone">Phone</option>
                      </select>
                    </td>
                    <td>
                      <select name="fieldRequired" defaultValue={field.required ? "1" : "0"}>
                        <option value="1">Yes</option>
                        <option value="0">No</option>
                      </select>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <input name="fieldTitle" placeholder="New question" />
                  </td>
                  <td>
                    <select name="fieldType" defaultValue="text">
                      <option value="text">Text</option>
                      <option value="date">Date</option>
                      <option value="textarea">Textarea</option>
                      <option value="checkbox">Checkbox</option>
                    </select>
                  </td>
                  <td>
                    <select name="fieldRequired" defaultValue="0">
                      <option value="1">Yes</option>
                      <option value="0">No</option>
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <button className="btn btn-accent" type="submit">
            Save form
          </button>
        </form>
      </SectionCard>

      <SectionCard title={`Submissions (${form.submissions.length})`}>
        {form.submissions.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Status</th>
                  <th>Answers</th>
                </tr>
              </thead>
              <tbody>
                {form.submissions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.createdAt.toLocaleString()}</td>
                    <td>
                      <StatusBadge tone={statusTone(s.status)}>{s.status}</StatusBadge>
                    </td>
                    <td className="muted">
                      <code style={{ whiteSpace: "pre-wrap" }}>{s.answersJson.slice(0, 280)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No submissions yet.</p>
        )}
      </SectionCard>
    </div>
  );
}
