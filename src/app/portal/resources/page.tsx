import Link from "next/link";
import { PageHeader, QuickLink, SectionCard } from "@/components/portal/Workspace";
import { requireUser } from "@/lib/guard";
import { addCoaDocument } from "@/lib/portal-ops-actions";
import { prisma } from "@/lib/prisma";

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ coa?: string }>;
}) {
  const user = await requireUser();
  const notices = await searchParams;
  const [teamCount, patientCount, location, pendingScripts, coas] = await Promise.all([
    prisma.user.count({ where: { orgId: user.orgId } }),
    prisma.clinicalPatient.count({ where: { orgId: user.orgId } }),
    prisma.practiceLocation.findFirst({ where: { orgId: user.orgId } }),
    prisma.order.count({ where: { orgId: user.orgId, escriptStatus: "pending_signature" } }),
    prisma.coaDocument.findMany({ where: { orgId: user.orgId }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  const checklist = [
    { done: teamCount > 0, title: "Add your prescribers and staff", href: "/portal/team", who: "Practice admin" },
    {
      done: Boolean(location?.street1),
      title: "Load practice location & ship-to",
      href: "/portal/settings?tab=profile",
      who: "Practice admin",
    },
    { done: patientCount > 0, title: "Add your first patient", href: "/portal/patients/new", who: "Staff" },
    { done: true, title: "Write an eScript from a paid order", href: "/portal/script-requests", who: "Prescriber" },
    { done: pendingScripts === 0, title: "Clear script requests / watch orders ship", href: "/portal/orders", who: "Staff" },
    { done: user.org.onboardingComplete, title: "Finish onboarding settings", href: "/portal/settings", who: "Practice admin" },
  ];

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Resources"
        title="Practice resources"
        lede="Launch checklist, handouts, CoA library, peptide calculators, product directory, and FAQ."
      />
      {notices.coa ? <p className="note">CoA document added.</p> : null}

      <div className="ws-quick-grid">
        <QuickLink href="/portal/education" title="Materials" body="Shareable decks and product education" />
        <QuickLink href="/portal/price-list" title="Product directory" body="Formulary pricing by class" />
        <QuickLink href="/portal/resources/calculator" title="Peptide calculators" body="Reconstitution & dosing helper" />
        <QuickLink href="/portal/resources/handouts" title="Patient handouts" body="Printable injection & storage guides" />
        <QuickLink href="/portal/catalog" title="Marketplace" body="503A / 503B / supplies ordering" />
        <QuickLink href="/portal/support" title="FAQ / Support" body="Relay assistant and live chat" />
      </div>

      <SectionCard title="Launch checklist" description="Work top to bottom. Most practices finish this in a day or two.">
        <ol className="ws-stack" style={{ paddingLeft: 18 }}>
          {checklist.map((item, i) => (
            <li key={item.title}>
              <b>
                {i + 1}. {item.title}
              </b>{" "}
              <span className="muted">· {item.who}</span>
              {item.done ? <span className="ws-badge ws-badge-ok" style={{ marginLeft: 8 }}>done</span> : null}
              <div>
                <Link className="ws-text-link" href={item.href}>
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ol>
      </SectionCard>

      <SectionCard title="CoA library" description="Certificates of analysis by SKU / lot for your practice archive.">
        <form action={addCoaDocument} className="ws-message-form" style={{ marginBottom: 16 }}>
          <div className="ws-kv">
            <label>
              Title
              <input name="title" required placeholder="Semaglutide 5mg CoA" />
            </label>
            <label>
              SKU
              <input name="sku" />
            </label>
            <label>
              Lot #
              <input name="lotNumber" />
            </label>
            <label>
              Document URL
              <input name="url" placeholder="https://…" />
            </label>
          </div>
          <label>
            Notes
            <input name="notes" />
          </label>
          <button className="btn btn-accent" type="submit">
            Add CoA
          </button>
        </form>
        {coas.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>SKU</th>
                  <th>Lot</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {coas.map((c) => (
                  <tr key={c.id}>
                    <td>{c.title}</td>
                    <td>{c.sku || "—"}</td>
                    <td>{c.lotNumber || "—"}</td>
                    <td>
                      {c.url ? (
                        <a className="ws-text-link" href={c.url} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No CoA documents uploaded yet.</p>
        )}
      </SectionCard>
    </div>
  );
}
