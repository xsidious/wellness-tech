import type { Metadata } from "next";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSeoMetadata({
  title: "About Wellness Tech",
  description: "Wellness Tech owns the practice experience. RxHere owns the pharmacy - one account, one invoice, live order status.",
  canonicalPath: "/about",
});

import { MarketingShell } from "@/components/MarketingShell";
import { PageBanner } from "@/components/PageBanner";
import { photos } from "@/lib/photos";

export default function AboutPage() {
  return (
    <MarketingShell>
      <PageBanner
        kicker="About"
        title="Wellness Tech owns the practice experience. RxHere owns the pharmacy."
        lede="This app does not store patient charts. It keeps commercial accounts, pricing, and an RxCore reference for each order."
        image={photos.hero}
      />
      <section className="wrap section">
        <div className="grid-3">
          <article className="card"><b>One account</b><span>Owners, prescribers, staff, and billing share a practice. Each role sees only its work.</span></article>
          <article className="card"><b>One invoice</b><span>503A, 503B, and supplies can split in fulfillment and still bill together.</span></article>
          <article className="card"><b>Live status</b><span>RxCore sends received, verified, compounding, shipped, and delivered.</span></article>
        </div>
      </section>
    </MarketingShell>
  );
}
