# Security gate

Automated checks live in `src/lib/security.test.ts` and `src/lib/rules.test.ts`. Run them with `npm test`.

Covered in this copy:

- Product-class gates, including the Tier 1 block on 503B office-use stock.
- Commission math refuses prescription classes.
- Webhook signatures use HMAC-SHA256 and reject a tampered body.
- Duplicate webhook event IDs are ignored by the ingest function.
- Checkout tokenization accepts only four digits and never a full card number.
- License and DEA values are encrypted before they are stored.
- Session cookies are HMAC signed, `httpOnly`, `Secure` in production, 4-hour absolute TTL.
- Practice login: password + optional PIN MFA, honeypot, origin check, IP/email rate limits, account lockout after failed attempts, audit of success/failure.
- Cloudflare Turnstile on login/signup when `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` are set.
- Strong password policy on signup (length, mixed case, number, symbol).
- Security headers: CSP, HSTS (prod), COOP/CORP, frame deny.
- Billing users are blocked from the patient list in the portal layout.
- Patient pages store initials and an RxCore reference only.

Not done, and required before a real launch:

- An independent penetration test. Do not treat `npm test` as that test.
- A signed BAA, HIPAA hosting, MFA via a hardware key / authenticator app, and the license, DEA, and OIG vendors.
- Redis-backed rate limits (in-memory buckets reset per serverless instance).
- Compliance sign-off on exosomes, distributor licensing, prescription commissions, and the merchant account.
- RxHere Partner API tokens and webhook secrets stay in environment variables. Never commit them. Configure the portal webhook URL to `/api/webhooks/rxhere`.

Those items stay off until Sarah and counsel close section 17 of the RxCore blueprint.
