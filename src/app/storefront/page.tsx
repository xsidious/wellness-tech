import type { Metadata } from "next";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSeoMetadata({
  title: "Storefront",
  description: "Practice-facing storefront overview for Wellness Tech Distribution.",
  canonicalPath: "/storefront",
});

import Link from "next/link";
import { MarketingShell } from "@/components/MarketingShell";
import { PageBanner } from "@/components/PageBanner";
import { photos } from "@/lib/photos";

const goals = [
  ["Lose weight", "Goal-based start. A clinician at the practice decides eligibility.", photos.weight],
  ["Perform better", "No drug name on the front door.", photos.supplies],
  ["Regrow hair", "Same monthly price is a practice setting, not set here.", photos.consult],
  ["Age well", "Disclosures stay on the page and cannot be removed.", photos.exosomes],
];

export default function StorefrontPage() {
  return (
    <MarketingShell>
      <PageBanner
        kicker="Fairfax Concierge"
        title="Personalized care, shipped to your door."
        lede="Sample storefront. The practice is the seller and prescriber. RxHere dispenses. There is no clinician network on this page."
        image={photos.hero}
      />
      <section className="wrap section stack">
        <div className="grid-2">
          {goals.map(([title, copy, image]) => (
            <article className="card" key={title}>
              <img className="card-photo" src={image} alt="" />
              <b>{title}</b>
              <span>{copy}</span>
              <Link href="/patient">See tracking</Link>
            </article>
          ))}
        </div>
        <p className="note">Compounded medications are not FDA-approved. A prescription is required. Eligibility is decided by a licensed clinician. Dispensed by RxHere.</p>
      </section>
    </MarketingShell>
  );
}
