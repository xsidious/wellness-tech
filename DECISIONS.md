# Phase 0 decisions

These are the working decisions for this build. Items marked pending still need Sarah Lafi, the Director of Compliance, or healthcare counsel. The app does not turn those items on.

## Confirmed for this working copy

- This is a separate app from KIAN Privé. It lives in `wellness-tech` and does not use the KIAN clinic database.
- The visual system is the teal Wellness Tech homepage (`#0E6E66`, Plus Jakarta Sans, dark `#0F2526` sections). The cream RxHere canvas is not mixed in, so the public site and the portal are one brand.
- VitaRelay Practice API is the live pharmacy logistics path (`VITARELAY_API_KEY` / `EVENTIDE_API_KEY`, base `/api/public/practice/v1`, webhooks at `/api/webhooks/eventide`). Legacy `RXHERE_*` env aliases still work. Without a key, portal checkout uses local sandbox order ids. KIAN posts paid therapy orders to `/api/partner/orders` → WT `POST /prescriptions`.
- Local data is SQLite for development. Production remains PostgreSQL on a HIPAA-eligible host with a BAA. That host is not chosen yet, so this copy is not a production launch.
- Repository ownership in the spec is RxHere Holdings LLC. This copy is local until that GitHub organization is named. It is not part of the KIAN Privé repo.

## Held until compliance signs off

- Exosome SKUs are visible and cannot be ordered.
- Bulk API SKUs cannot be ordered, including at Tier 4.
- Affiliate commission is calculated only on devices and supplies. Prescription classes (503A, 503B, brand) earn nothing.
- No clinician network is offered on the storefront.
- No ACH payouts are sent. Commission rows stay `pending_batch` for finance.
- Flat shipping is a sandbox amount: $15 ambient, $35 cold chain. Sarah still needs to set the real fee and free-shipping threshold.
- State license, DEA, and OIG vendors are not connected. A matched NPI plus an attested license sets Tier 1 in sandbox and the audit log records that the other checks are pending. Sandbox NPI `1000000001` works offline.
- Card and bank numbers are never stored. Checkout accepts the last four digits and saves a processor token only.

## Acceptance this copy can demonstrate

- A user signs in with a one-time email code and a second factor, and the login is audited.
- A Tier 1 account cannot check out 503B office-use stock.
- One checkout with a 503A line, a 503B line, and a supply shows the split, creates one invoice, and can be moved to delivered through signed RxCore webhooks.
- An affiliate code on signup is stored on the organization. Delivered device or supply lines create a commission. Prescription lines do not.
- A sandbox API key can place an order and the webhook log records the events.
- Old `/shop` and `/register` URLs redirect. The other public paths are the new pages.
