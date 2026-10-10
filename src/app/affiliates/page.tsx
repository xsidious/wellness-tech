import type { Metadata } from "next";
import { buildSeoMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildSeoMetadata({
  title: "Affiliates",
  description: "Affiliate and referral partnership opportunities with Wellness Tech Distribution.",
  canonicalPath: "/affiliates",
});

import Link from "next/link";
import { MarketingShell } from "@/components/MarketingShell";
import { PageBanner } from "@/components/PageBanner";
import { photos } from "@/lib/photos";

const steps = [
  ["01", "Open an affiliate account", "Sign up as a sales partner. You choose a 6-digit PIN, and the account stores a W-9 status for payout review."],
  ["02", "Share your code", "The portal gives you a code and a link in the form /?ref=YOURCODE. A practice that signs up with it is attached to you."],
  ["03", "They order devices or supplies", "Commission is 10 percent of those lines only, and only after the order is marked delivered."],
  ["04", "Read the statement", "The portal lists each referred practice, the invoice, the eligible amount, and the commission. Rows stay in a pending batch."],
];

export default function AffiliatesPage() {
  return (
    <MarketingShell>
      <PageBanner
        kicker="Affiliates"
        title="Refer a practice. Commission is paid on devices and supplies."
        lede="You earn 10 percent after a referred practice’s device or supply order is delivered. Prescription lines earn nothing. Payouts stay pending until finance and compliance sign off."
        image={photos.consult}
      >
        <Link className="btn btn-accent" href="/signup?type=affiliate">Join the program</Link>
      </PageBanner>

      <section className="wrap section stack">
        <span className="kicker">How it works</span>
        <h2 style={{ margin: 0 }}>From referral link to a pending statement.</h2>
        <div className="grid-2">
          {steps.map(([n, title, copy]) => (
            <article className="card" key={n}>
              <span className="kicker">{n}</span>
              <b>{title}</b>
              <span>{copy}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="band">
        <div className="wrap stack">
          <span className="kicker">What commission covers</span>
          <h2 style={{ margin: 0 }}>Devices and supplies only.</h2>
          <div className="grid-3">
            <article className="dark-card stack">
              <b>Pays 10 percent</b>
              <span>Aesthetic equipment (including Celexo PRO) and clinical supplies such as syringe kits. Commission posts when that order is delivered. Device pricing is available upon request.</span>
            </article>
            <article className="dark-card stack">
              <b>Pays nothing</b>
              <span>503A patient-specific lines, 503B office stock, and brand products. Exosomes and bulk APIs are not commissionable, and exosomes stay off checkout.</span>
            </article>
            <article className="dark-card stack">
              <b>How it posts</b>
              <span>Eligible device and supply lines earn 10 percent of that line. Prescription lines on the same invoice earn nothing. Exact catalog pricing is available upon request.</span>
            </article>
          </div>
        </div>
      </section>

      <section className="wrap section">
        <div className="why">
          <div className="stack">
            <span className="kicker">Inside the portal</span>
            <h2 style={{ margin: 0 }}>You can see who signed up and what posted.</h2>
            <span>After you sign in, Commissions shows your code, the practices that used it, and each statement row: invoice, eligible subtotal, 10 percent, and status. ACH is not sent. Every row stays pending for finance.</span>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <Link className="btn btn-accent" href="/signup?type=affiliate">Join the program</Link>
              <Link className="btn btn-ghost" href="/login">Sign in</Link>
            </div>
          </div>
          <img className="photo" src={photos.equipment} alt="" style={{ height: 360 }} />
        </div>
      </section>
    </MarketingShell>
  );
}
