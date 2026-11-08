import Link from "next/link";
import { PageHeader, SectionCard } from "@/components/portal/Workspace";
import { requireUser } from "@/lib/guard";

const HANDOUTS = [
  {
    slug: "injection",
    title: "Subcutaneous injection basics",
    body: "Wash hands. Clean vial and site with alcohol. Draw dose. Pinch skin, insert at 45–90°, inject slowly, dispose needle safely.",
  },
  {
    slug: "storage",
    title: "Cold-chain storage at home",
    body: "Keep reconstituted peptide refrigerated. Do not freeze. Protect from light. Discard after labeled BUD / pharmacy instructions.",
  },
  {
    slug: "first-weeks",
    title: "What to expect in the first 2 weeks",
    body: "Mild injection-site redness can occur. Report severe symptoms. Stay hydrated. Follow titration schedule on your signed prescription.",
  },
];

export default async function HandoutsPage() {
  const user = await requireUser();
  const branding = (() => {
    try {
      return JSON.parse(user.org.brandingJson || "{}") as { active?: boolean; displayName?: string };
    } catch {
      return {};
    }
  })();
  const practiceName = branding.active && branding.displayName ? String(branding.displayName) : user.org.legalName;

  return (
    <div className="ws-stack invoice-print">
      <PageHeader
        kicker="Patient handouts"
        title="Printable guides"
        lede={`Rendered with ${practiceName} branding. Print or save as PDF from your browser.`}
        actions={
          <div className="ws-head-actions no-print">
            <Link className="btn btn-ghost" href="/portal/resources">
              Resources
            </Link>
            <a className="btn btn-accent" href="#print" id="print-trigger">
              Print / PDF
            </a>
          </div>
        }
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `document.getElementById('print-trigger')?.addEventListener('click',function(e){e.preventDefault();window.print();});`,
        }}
      />

      {HANDOUTS.map((h) => (
        <SectionCard key={h.slug} title={h.title}>
          <p className="muted">{practiceName}</p>
          <p style={{ fontSize: "1.05rem", lineHeight: 1.6 }}>{h.body}</p>
          <p className="muted">Educational material — follow your clinician’s signed instructions.</p>
        </SectionCard>
      ))}
    </div>
  );
}
