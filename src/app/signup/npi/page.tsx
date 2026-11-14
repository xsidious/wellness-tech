import { redirect } from "next/navigation";
import { MarketingShell } from "@/components/MarketingShell";
import { NpiSignupWizard } from "@/components/NpiSignupWizard";
import { requireUser } from "@/lib/guard";
import { photos } from "@/lib/photos";

export default async function NpiPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (user.org.verificationTier >= 1 && user.credential) redirect("/portal");
  const query = await searchParams;
  const initialError = query.error ? decodeURIComponent(query.error.replace(/\+/g, " ")) : "";

  return (
    <MarketingShell variant="auth">
      <section className="auth-stage">
        <div className="auth-stage-grid">
          <div className="auth-panel-col">
            <div className="auth-panel-inner">
              <p className="kicker auth-kicker">Step 2 · Credentials</p>
              <h1 className="auth-title">Verify your NPI &amp; license.</h1>
              <p className="auth-lede">
                Tier 1 unlocks portal ordering. We check CMS for your NPI, then save your attested state license.
              </p>
              <NpiSignupWizard initialError={initialError} />
            </div>
          </div>
          <aside className="auth-visual" aria-hidden="true">
            <img src={photos.consult} alt="" className="auth-visual-img" />
            <div className="auth-visual-shade" />
            <div className="auth-visual-copy">
              <p className="auth-visual-brand">Wellness Tech Distribution</p>
              <p className="auth-visual-line">Licensed practices only · NPI matched to the CMS registry.</p>
            </div>
          </aside>
        </div>
      </section>
    </MarketingShell>
  );
}
