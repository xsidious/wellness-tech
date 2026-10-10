import type { Metadata } from "next";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSeoMetadata({
  title: "Become a Prescriber",
  description: "Request practice access to Wellness Tech Distribution for 503A/503B ordering.",
  canonicalPath: "/signup",
});

import { MarketingShell } from "@/components/MarketingShell";
import { SignupPanel } from "@/components/AuthPanel";
import { photos } from "@/lib/photos";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ type?: string; ref?: string; email?: string }> }) {
  const query = await searchParams;
  const accountType = query.type === "affiliate" || query.type === "telehealth" ? query.type : "practice";
  return (
    <MarketingShell>
      <section className="wrap page-banner">
        <div className="page-banner-grid">
          <div className="stack">
            <span className="kicker">Create an account</span>
            <h1>{accountType === "affiliate" ? "Join as an affiliate" : "Open a practice account"}</h1>
            <p className="lede">This creates an organization at Tier 0. Prescribers continue to NPI verification. Referral code {query.ref || "none"} is stored on the organization when it matches.</p>
            <SignupPanel accountType={accountType} refCode={query.ref || ""} email={query.email || ""} />
          </div>
          <img className="banner-photo" src={accountType === "affiliate" ? photos.equipment : photos.hero} alt="" />
        </div>
      </section>
    </MarketingShell>
  );
}
