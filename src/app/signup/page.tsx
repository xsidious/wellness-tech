import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { MarketingShell } from "@/components/MarketingShell";
import { SignupPanel } from "@/components/AuthPanel";
import { photos } from "@/lib/photos";

export const metadata: Metadata = buildSeoMetadata({
  title: "Become a Prescriber",
  description: "Request practice access to Wellness Tech Distribution for 503A/503B ordering.",
  canonicalPath: "/signup",
});

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ type?: string; ref?: string; email?: string }> }) {
  const query = await searchParams;
  const accountType = query.type === "affiliate" || query.type === "telehealth" ? query.type : "practice";
  const title = accountType === "affiliate" ? "Join as an affiliate." : "Open a practice account.";
  const visual = accountType === "affiliate" ? photos.equipment : photos.hero;
  return (
    <MarketingShell variant="auth">
      <section className="auth-stage">
        <div className="auth-stage-grid">
          <div className="auth-panel-col">
            <div className="auth-panel-inner">
              <p className="kicker auth-kicker">Create an account</p>
              <h1 className="auth-title">{title}</h1>
              <p className="auth-lede">
                Start at verification Tier 0. Prescribers continue to NPI after signup
                {query.ref ? <> · referral <strong>{query.ref}</strong></> : null}.
              </p>
              <SignupPanel
                accountType={accountType}
                refCode={query.ref || ""}
                email={query.email || ""}
                turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""}
              />
              <p className="auth-aside">
                Already have access? <Link href="/login">Sign in</Link>
              </p>
            </div>
          </div>
          <aside className="auth-visual" aria-hidden="true">
            <img src={visual} alt="" className="auth-visual-img" />
            <div className="auth-visual-shade" />
            <div className="auth-visual-copy">
              <p className="auth-visual-brand">Wellness Tech Distribution</p>
              <p className="auth-visual-line">Built for licensed practices ordering 503A and 503B therapies.</p>
            </div>
          </aside>
        </div>
      </section>
    </MarketingShell>
  );
}
