import { MarketingShell } from "@/components/MarketingShell";
import { LoginPanel } from "@/components/AuthPanel";
import { photos } from "@/lib/photos";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = (await searchParams).next || "";
  const nextPath = next.startsWith("/") && !next.startsWith("//") ? next : "";
  return (
    <MarketingShell>
      <section className="wrap page-banner">
        <div className="page-banner-grid">
          <div className="stack">
            <span className="kicker">Practice portal</span>
            <h1>One login for the practice.</h1>
            <p className="lede">
              Three steps: email → one-time code → 6-digit PIN. Demo PIN is 246810.
              Staff catalog admins should use the{" "}
              <a href="/admin/login">dedicated admin login</a> instead.
            </p>
            <LoginPanel nextPath={nextPath} />
          </div>
          <img className="banner-photo" src={photos.consult} alt="A clinician in consultation" />
        </div>
      </section>
    </MarketingShell>
  );
}
