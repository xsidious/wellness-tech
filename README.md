# Wellness Tech

B2B practice platform. Paid KIAN Privé therapy orders post to `POST /api/partner/orders`, then Wellness Tech places 503A/503B lines on the **Eventide / VitaRelay Practice API** (`POST /prescriptions`).

## Run

```bash
npm install
npm run setup
npm run dev
```

Open http://localhost:3010

Sync the formulary (probes Eventide/VitaRelay, falls back to local catalog JSON):

```bash
npx tsx scripts/sync-formulary.ts
```

`npm test` runs the order, commission, webhook, and token checks.

## Partner env

Set `EVENTIDE_API_KEY` or `VITARELAY_API_KEY`, optional `EVENTIDE_API_BASE_URL`, `EVENTIDE_WEBHOOK_SECRET` / `VITARELAY_WEBHOOK_SECRET`, `WT_PARTNER_ORDER_SECRET`, and optionally `KIAN_STATUS_WEBHOOK_URL`. Do not commit tokens.

Webhook URL: `/api/webhooks/eventide`

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
