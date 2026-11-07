# Wellness Tech

B2B practice platform. Paid KIAN Privé therapy orders post to `POST /api/partner/orders`, then Wellness Tech places 503A lines on the RxHere Partner API (`POST /logistics/orders`).

## Run

```bash
npm install
npm run setup
npm run dev
```

Open http://localhost:3010

Sync the formulary (probes RxHere, falls back to `data/rxhere-formulary.json`):

```bash
npx tsx scripts/sync-formulary.ts
```

`npm test` runs the order, commission, webhook, and token checks.

## Partner env

Set `RXHERE_API_BASE_URL`, `RXHERE_API_TOKEN`, `RXHERE_WEBHOOK_SECRET`, `WT_PARTNER_ORDER_SECRET`, and optionally `KIAN_STATUS_WEBHOOK_URL`. Do not commit tokens.

## Practice sign-in (live)

Practice / affiliate users sign in at `/login` with **email + password**, then a **6-digit PIN** when MFA is enabled. Staff admins use `/admin/login`.

Set Cloudflare Turnstile keys (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`) for bot protection.

| Email | Password | PIN | Role |
| --- | --- | --- | --- |
| owner@fairfax.demo | Practice#Login9! | 246810 | Practice owner and prescriber, Tier 2 |
| billing@fairfax.demo | Practice#Login9! | 246810 | Billing, no patient page |
| affiliate@sales.demo | Practice#Login9! | 246810 | Affiliate code `FAIRFAX` |
| admin@wellnesstech.demo | WellnessTech#Admin9! | — | Catalog admin (`/admin/login`) |

Sandbox NPI for a new prescriber: `1000000001`. A real 10-digit NPI is looked up in the public NPI registry.

Demo API key: `wt_sandbox_demo_key`

Shipping on screen is the sandbox fee from `DECISIONS.md`, not a contracted rate.
