import Link from "next/link";
import { PageHeader, QuickLink, SectionCard } from "@/components/portal/Workspace";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export default async function ResourcesPage() {
  const user = await requireUser();
  const [teamCount, patientCount, location, pendingScripts] = await Promise.all([
    prisma.user.count({ where: { orgId: user.orgId } }),
    prisma.clinicalPatient.count({ where: { orgId: user.orgId } }),
    prisma.practiceLocation.findFirst({ where: { orgId: user.orgId } }),
    prisma.order.count({ where: { orgId: user.orgId, escriptStatus: "pending_signature" } }),
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
        lede="Launch checklist, education, CoA library pointers, peptide calculators, and patient handouts."
      />

      <div className="ws-quick-grid">
        <QuickLink href="/portal/education" title="Materials" body="Shareable decks and product education" />
        <QuickLink href="/portal/price-list" title="Product directory" body="Formulary pricing by class" />
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

      <div className="ws-split">
        <SectionCard title="Patient handouts">
          <p className="muted">
            Injection, storage, and what-to-expect handouts. Print or PDF with your practice name from Branding settings.
          </p>
          <ul>
            <li>Subcutaneous injection basics</li>
            <li>Cold-chain storage at home</li>
            <li>What to expect in the first 2 weeks</li>
          </ul>
        </SectionCard>
        <SectionCard title="CoA library & peptide calculators">
          <p className="muted">
            Certificates of analysis ship with pharmacy fulfillment packets. Use marketplace product detail pages for strength
            and reconstitution guidance; advanced calculators live alongside education materials.
          </p>
          <Link className="btn btn-ghost" href="/portal/education">
            Open education
          </Link>
        </SectionCard>
      </div>
    </div>
  );
}
