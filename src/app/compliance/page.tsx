import type { Metadata } from "next";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSeoMetadata({
  title: "Compliance",
  description: "How Wellness Tech structures 503A patient-specific and 503B office-use ordering for licensed practices.",
  canonicalPath: "/compliance",
});

import { MarketingShell } from "@/components/MarketingShell";
import { PageBanner } from "@/components/PageBanner";
import { photos } from "@/lib/photos";

export default function CompliancePage() {
  return (
    <MarketingShell>
      <PageBanner
        kicker="503A / 503B"
        title="One login. Separate rules for each class."
        lede="RxHere decides the pharmacy. Wellness Tech decides who can see a price and who can check out."
        image={photos.peptides}
      />
      <section className="wrap section">
        <div className="grid-2">
          <article className="card"><img className="card-photo" src={photos.weight} alt="" /><b>503A</b><span>Tier 1, patient initials on every line, dispensed by RxHere.</span></article>
          <article className="card"><img className="card-photo" src={photos.peptides} alt="" /><b>503B office use</b><span>Tier 2. No patient name. A Tier 1 account cannot check this out.</span></article>
          <article className="card"><img className="card-photo" src={photos.supplies} alt="" /><b>Devices and supplies</b><span>Same cart, sales tax still to be configured.</span></article>
          <article className="card"><img className="card-photo" src={photos.exosomes} alt="" /><b>Exosomes and bulk API</b><span>Held for compliance sign-off.</span></article>
        </div>
      </section>
    </MarketingShell>
  );
}
