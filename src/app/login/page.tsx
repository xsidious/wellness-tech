import type { Metadata } from "next";
import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { MarketingShell } from "@/components/MarketingShell";
import { LoginPanel } from "@/components/AuthPanel";
import { photos } from "@/lib/photos";

export const metadata: Metadata = buildSeoMetadata({
  title: "Practice Login",
  description: "Sign in to your Wellness Tech Distribution practice account.",
  canonicalPath: "/login",
  noIndex: true,
});

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = (await searchParams).next || "";
  const nextPath = next.startsWith("/") && !next.startsWith("//") ? next : "";
  return (
    <MarketingShell variant="auth">
      <section className="auth-stage">
        <div className="auth-stage-grid">
          <div className="auth-panel-col">
            <div className="auth-panel-inner">
              <p className="kicker auth-kicker">Practice portal</p>
              <h1 className="auth-title">Welcome back.</h1>
              <p className="auth-lede">
                Sign in to order, track fulfillment, and manage your practice account.
              </p>
              <LoginPanel nextPath={nextPath} turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""} />
              <p className="auth-aside">
                New to Wellness Tech? <Link href="/signup">Request practice access</Link>
              </p>
            </div>
          </div>
          <aside className="auth-visual" aria-hidden="true">
            <img src={photos.consult} alt="" className="auth-visual-img" />
            <div className="auth-visual-shade" />
            <div className="auth-visual-copy">
              <p className="auth-visual-brand">Wellness Tech Distribution</p>
              <p className="auth-visual-line">One portal for therapies, supplies, and pharmacy fulfillment.</p>
            </div>
          </aside>
        </div>
      </section>
    </MarketingShell>
  );
}
