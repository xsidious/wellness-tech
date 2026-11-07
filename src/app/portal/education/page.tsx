import Link from "next/link";
import {
  EmptyState,
  PageHeader,
  SectionCard,
} from "@/components/portal/Workspace";
import { requireUser } from "@/lib/guard";
import { photos } from "@/lib/photos";
import { prisma } from "@/lib/prisma";

const covers: Record<string, string> = {
  "peptide-catalog": photos.peptides,
  "wellness-protocols": photos.consult,
  contraindications: photos.weight,
  "weight-protocol": photos.weight,
};

export default async function EducationPage() {
  const user = await requireUser();
  const items = await prisma.contentItem.findMany({ orderBy: { title: "asc" } });

  return (
    <div className="ws-stack">
      <PageHeader
        kicker="Resources"
        title="Education"
        lede="Clinical protocols, catalogs, and practice materials gated by verification tier."
      />

      {!items.length ? (
        <EmptyState title="No materials yet" body="Education content will appear here when published by Wellness Tech." />
      ) : (
        <div className="ws-catalog-grid">
          {items.map((item) => {
            const locked = user.org.verificationTier < item.accessTier && !user.roles.includes("admin");
            return (
              <article className="ws-product" key={item.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="ws-product-photo" src={covers[item.slug] || photos.consult} alt="" />
                <div className="ws-product-body">
                  <span className="ws-chip">{item.type}</span>
                  <h3>{item.title}</h3>
                  {locked ? (
                    <p className="muted">Unlocks at Tier {item.accessTier}.</p>
                  ) : (
                    <Link className="btn btn-accent" href={`/portal/education/${item.slug}`}>
                      Open
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <SectionCard title="Need help choosing protocols?">
        <p className="muted">Your assigned rep can walk through contraindications, peptide catalogs, and pharmacy routing rules.</p>
        <Link className="btn btn-ghost" href="/portal/messages">
          Message your rep
        </Link>
      </SectionCard>
    </div>
  );
}
