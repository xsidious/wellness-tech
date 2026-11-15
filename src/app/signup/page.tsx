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

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; ref?: string; email?: string; clinic?: string }>;
}) {
  const query = await searchParams;
  const accountType = query.type === "affiliate" || query.type === "telehealth" ? query.type : "practice";
  const clinicCode = (query.clinic || "").trim().toLowerCase();
  const title = clinicCode
    ? "Join your clinic workspace."
    : accountType === "affiliate"
      ? "Join as an affiliate."
      : "Open a practice account.";
  const visual = accountType === "affiliate" ? photos.equipment : photos.hero;
  const isAffiliate = accountType === "affiliate";
  return (
    <MarketingShell variant="auth">
      <section className="auth-stage">
        <div className="auth-stage-grid">
          <div className="auth-panel-col">
            <div className="auth-panel-inner">
              <p className="kicker auth-kicker">
                {clinicCode ? "Clinic invite" : isAffiliate ? "Affiliate signup" : "Step 1 · Account"}
              </p>
              <h1 className="auth-title">{title}</h1>
              <p className="auth-lede">
                {clinicCode
                  ? `Create your login for clinic code ${clinicCode}. You will land in that clinic’s Wellness Tech portal.`
                  : isAffiliate
                    ? "Create your affiliate login, then sign in to get your referral link."
                    : "Create your login first. Prescribers continue to NPI and license verification next"}
                {query.ref ? <> · referral <strong>{query.ref}</strong></> : null}
                {!clinicCode ? "." : null}
              </p>
              <p className="signup-type-switch" role="navigation" aria-label="Account type">
                <Link
                  href={`/signup${query.ref ? `?ref=${encodeURIComponent(query.ref)}` : ""}`}
                  className={!isAffiliate ? "is-active" : undefined}
                >
                  Practitioner
                </Link>
                <Link
                  href={`/signup?type=affiliate${query.ref ? `&ref=${encodeURIComponent(query.ref)}` : ""}`}
                  className={isAffiliate ? "is-active" : undefined}
                >
                  Affiliate
                </Link>
              </p>
              {isAffiliate ? (
                <ol className="signup-steps signup-steps-inline" aria-label="Signup progress">
                  <li className="signup-step is-active">
                    <span className="signup-step-num" aria-hidden>
                      1
                    </span>
                    <span>Account</span>
                  </li>
                  <li className="signup-step">
                    <span className="signup-step-num" aria-hidden>
                      2
                    </span>
                    <span>Portal</span>
                  </li>
                </ol>
              ) : (
                <ol className="signup-steps signup-steps-inline" aria-label="Signup progress">
                  <li className="signup-step is-active">
                    <span className="signup-step-num" aria-hidden>
                      1
                    </span>
                    <span>Account</span>
                  </li>
                  <li className="signup-step">
                    <span className="signup-step-num" aria-hidden>
                      2
                    </span>
                    <span>NPI</span>
                  </li>
                  <li className="signup-step">
                    <span className="signup-step-num" aria-hidden>
                      3
                    </span>
                    <span>License</span>
                  </li>
                </ol>
              )}
              <SignupPanel
                accountType={accountType}
                refCode={query.ref || ""}
                email={query.email || ""}
                clinicCode={clinicCode}
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
