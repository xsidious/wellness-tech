import Link from "next/link";
import { MarketingShell } from "@/components/MarketingShell";
import { photos } from "@/lib/photos";

const categories = [
  ["GLP-1 and weight", "Injectable and sublingual weight-management formulations.", photos.weight, "/products"],
  ["Peptides", "Practice catalog titles, reviewed before they reach a cart.", photos.peptides, "/products"],
  ["Celexo and Lumidor", "Celexo is topical. Lumidor is an exosome-infused topical for licensed aesthetic practices.", photos.exosomes, "/exosomes"],
  ["Anti-aging", "NAD+ and longevity categories for licensed practices.", photos.consult, "/products"],
  ["Performance", "Recovery and sports medicine categories.", photos.supplies, "/products"],
  ["Aesthetic equipment", "Devices, ancillaries, and medical supplies.", photos.equipment, "/supplies"],
];

export default function HomePage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  return <Home searchParams={searchParams} />;
}

async function Home({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const ref = (await searchParams).ref || "";
  return (
    <MarketingShell>
      <section className="wrap hero">
        <div className="stack hero-copy">
          <span className="pill">For licensed practitioners only</span>
          <h1>Compounded therapies and aesthetics, sourced for your practice.</h1>
          <p className="lede">Peptides, GLP-1s, Celexo and Lumidor exosomes, and clinical equipment from verified 503A/503B partners, with one login, one cart, and one invoice.</p>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <Link className="btn btn-accent" href={`/signup?type=practice${ref ? `&ref=${ref}` : ""}`}>Become a prescriber</Link>
            <Link className="btn btn-ghost" href="/products">Browse therapies</Link>
          </div>
          <div className="stats">
            <div><strong>One cart</strong><span>Every product class</span></div>
            <div><strong>503A/B</strong><span>Routed by RxHere</span></div>
            <div><strong>Rx only</strong><span>Tiered access</span></div>
            <div><strong>B2B</strong><span>Practice-first</span></div>
          </div>
        </div>
        <img className="photo" src={photos.hero} alt="Treatment room prepared for a licensed practice" />
      </section>
      <section className="trust" aria-label="Highlights">
        <div className="wrap">
          <span>NPI credentialing</span><span>Tiered access</span><span>One invoice</span><span>Live RxCore status</span><span>Clinician education</span>
        </div>
      </section>
      <section className="wrap section stack">
        <span className="kicker">Formulary and systems</span>
        <h2>Built around what practices order every week.</h2>
        <div className="grid-3">
          {categories.map(([title, copy, image, href]) => (
            <Link className="card" href={href} key={title}>
              <img className="card-photo" src={image} alt="" />
              <b>{title}</b>
              <span>{copy}</span>
            </Link>
          ))}
        </div>
      </section>
      <section className="wrap section stack">
        <span className="kicker">Start where you are</span>
        <h2>Three ways into the network.</h2>
        <div className="grid-3">
          <Link className="card dark" href="/signup?type=practice"><span>For practices</span><b>Prescribers</b><span>NPI-verified access. Tier 1 can order patient-specific Rx. Office stock waits for Tier 2.</span></Link>
          <Link className="card" href="/affiliates"><span>For sales partners</span><b>Affiliates</b><span>Referral links and commission on devices and supplies. Prescription classes are excluded.</span></Link>
          <Link className="card" href="/products"><span>For procurement</span><b>Marketplace</b><span>Browse therapies and supplies after your practice is verified.</span></Link>
        </div>
      </section>
      <section className="band">
        <div className="wrap stack">
          <span className="kicker">How it works</span>
          <h2>From credentialing to fulfillment, without the manual handoff.</h2>
          <div className="grid-3">
            {[
              ["01", "Credential", "Sign up, confirm your NPI, and reach Tier 1 when the registry matches."],
              ["02", "Match", "RxCore routes each line by class, state, stock, and BUD."],
              ["03", "Prescribe", "You sign the prescription. Staff can draft, not sign."],
              ["04", "Fulfill", "RxHere dispenses or sources the line and sends live status back."],
            ].map(([n, title, copy]) => (
              <div className="dark-card stack" key={n}><span>{n}</span><b>{title}</b><span>{copy}</span></div>
            ))}
          </div>
        </div>
      </section>
      <section className="wrap section">
        <div className="why">
          <img className="banner-photo" src={photos.consult} alt="A clinician speaking with a patient in a quiet room" />
          <div className="stack">
            <span className="kicker">Why practices switch</span>
            <h2>Compliance, depth, and speed together.</h2>
            <p>Quality you can defend and ordering in one B2B system for licensed practices.</p>
            <p className="muted">Ideal for med spas, aesthetic clinics, concierge wellness, hormone practices, and telehealth prescribers.</p>
          </div>
        </div>
      </section>
      <section className="wrap section">
        <div className="panel grid-2">
          <div className="stack">
            <span className="kicker">Register your practice</span>
            <h2>Unlock catalogs and clinical protocols.</h2>
            <p className="lede">Access is an account, not a one-off form. The code appears on the next screen in this sandbox.</p>
          </div>
          <form className="form" action="/signup" method="get">
            <input type="hidden" name="type" value="practice" />
            <label>Referral code<input name="ref" defaultValue={ref} placeholder="Optional" /></label>
            <button className="btn btn-accent" type="submit">Request access</button>
            <span className="muted">Already registered? <Link href="/login">Sign in</Link></span>
          </form>
        </div>
      </section>
    </MarketingShell>
  );
}
