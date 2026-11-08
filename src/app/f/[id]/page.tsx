import { notFound } from "next/navigation";
import { submitPublicForm } from "@/lib/portal-ops-actions";
import { prisma } from "@/lib/prisma";

type Field = { id: string; label: string; type: string; required?: boolean };

export default async function PublicFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ thanks?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const form = await prisma.practiceForm.findFirst({
    where: { id, active: true },
    include: { org: true },
  });
  if (!form) notFound();
  const branding = (() => {
    try {
      return JSON.parse(form.org.brandingJson || "{}") as { active?: boolean; displayName?: string; primary?: string };
    } catch {
      return {};
    }
  })();
  const fields = JSON.parse(form.schemaJson || "[]") as Field[];
  const name = branding.active && branding.displayName ? branding.displayName : form.org.legalName;

  if (q.thanks) {
    return (
      <main className="auth-shell">
        <div className="auth-card" style={{ maxWidth: 520, margin: "48px auto" }}>
          <p className="muted">{name}</p>
          <h1>Thank you</h1>
          <p>Your {form.title.toLowerCase()} was submitted to the practice.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <div className="auth-card" style={{ maxWidth: 560, margin: "48px auto", borderTop: `4px solid ${branding.primary || "#184868"}` }}>
        <p className="muted">{name}</p>
        <h1>{form.title}</h1>
        <p className="muted">{form.kind} form</p>
        <form action={submitPublicForm} className="ws-message-form">
          <input type="hidden" name="formId" value={form.id} />
          {fields.map((field) => (
            <label key={field.id}>
              {field.label}
              {field.type === "textarea" ? (
                <textarea name={field.id} rows={4} required={field.required} />
              ) : field.type === "checkbox" ? (
                <input name={field.id} type="checkbox" value="yes" required={field.required} />
              ) : (
                <input
                  name={field.id}
                  type={field.type === "date" ? "date" : field.type === "email" ? "email" : "text"}
                  required={field.required}
                />
              )}
            </label>
          ))}
          <button className="btn btn-accent" type="submit">
            Submit
          </button>
        </form>
      </div>
    </main>
  );
}
