# Quickstart: validate Mandate end to end

## Prerequisites

- Node 20.9+, pnpm, Postgres 16 (local or Render), a public HTTPS tunnel for webhooks (cloudflared).
- PayPal sandbox app with Vault enabled, 3 business accounts, 1 personal buyer: `docs/sandbox-setup.md`.
- `.env.local` from `.env.example` (PayPal, Anthropic, DATABASE_URL, AG Studio license, session secret).

## Setup

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Scripted checks

```bash
pnpm test
```

Expected: unit tests for canonicalization, pricing and `runMandateCheck`; bypass suite
([contracts/consent-gate.md](contracts/consent-gate.md)) all green.

```bash
pnpm e2e
```

Expected: Playwright journeys on Desktop Chrome and Pixel 7 profiles green (PayPal popups use the sandbox
buyer from `E2E_PAYPAL_BUYER_*` env vars).

## Manual walkthrough (what a judge does)

1. Open `/`, press Create a Mandate, use the prefilled example, check flagged assumptions, sign.
   Expected: fingerprint shown; `/api/mandates/:code/verify` returns `match: true`.
2. Link PayPal with the sandbox buyer. Expected: status Active.
3. Ask the agent for running shoes. Pick the Daily Miler. Expected: 7 of 7 terms pass, agent pays, order
   appears in History as Compliant, paid; PayPal sandbox merchant activity shows the `custom_id`.
4. Ask for the Tempo Racer. Expected: Blocked, 2 of 7 fail, no payment; try Approve Changes: new version
   and new fingerprint; or Cancel.
5. Revoke. Expected: any further pay attempt is refused (409) and logged.
6. Switch to Merchant. Expected: AG Grid shows the order with mandate id, grouping and export work.
7. Open the claimed pool dispute. Expected: evidence file with 5 items, draft cites only those items;
   submit is disabled until the accuracy box is ticked; after submit, PayPal status shown.

## Deploy gate

Tests and e2e green, secret scan clean (`pnpm scan:secrets`), `/privacy` and favicon present, then deploy
to Render (`render.yaml`).
