export default function MigrationPage() {
  return (
    <>
      <h1>Migration</h1>
      <ul>
        <li>Old roles map to owner, prescriber, affiliate, or billing. Imported prescribers start at Tier 0 and move up after NPI verification.</li>
        <li>Passwords are not copied. Each person gets an email code and sets a new second factor.</li>
        <li>Referral code FAIRFAX and other codes keep working through <code>/?ref=CODE</code>.</li>
        <li>301 redirects: /shop to /products, /register to /signup. /products, /exosomes, /supplies, /affiliates, /login, and /compliance are the new pages.</li>
        <li>The old site should stay read-only for 30 days after DNS cutover. Do not run that cutover from this sandbox.</li>
      </ul>
    </>
  );
}
