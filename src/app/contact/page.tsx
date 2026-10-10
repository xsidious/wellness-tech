import type { Metadata } from "next";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSeoMetadata({
  title: "Contact",
  description: "Contact Wellness Tech Distribution for practice onboarding, formulary questions, and partnership.",
  canonicalPath: "/contact",
});

import { MarketingShell } from "@/components/MarketingShell";
import { PageBanner } from "@/components/PageBanner";
import { photos } from "@/lib/photos";

export default function ContactPage() {
  return (
    <MarketingShell>
      <PageBanner
        kicker="Contact"
        title="Talk to the team."
        lede="Practice access is self-serve. For a commercial question, write or call the distribution desk."
        image={photos.consult}
      />
      <section className="wrap section">
        <div className="panel stack">
          <b>Wellness Tech Distribution</b>
          <span>Admin@thewellnesstech.com</span>
          <span>877-847-6423</span>
          <span className="muted">Demo requests from the old site are replaced by self-serve signup.</span>
        </div>
      </section>
    </MarketingShell>
  );
}
