# PROGRESS — Mandate (PayPal AI Hackathon)

Deadline: 2026-11-12 12:00 PT (Devpost `paypalaihackathon`). Demo must stay testable until 2026-12-15 08:00 PT.
Targets: Grand Prizes, Best Use of Agentic Commerce, AG Grid sponsor prize (Render prize if hosted on Render).

## Current step
US2 money core DONE 2026-10-17 (T045, T046, T047, T049, T050, T051): Mandate check, semantic judge, PayPal money calls, consent gate, bypass + concurrency suites (101 tests green). Remaining in Phase 2: sandbox scripts T012..T020, BLOCKED on the user's PayPal sandbox keys. Next keyless work: US1 mandate service (draft, sign, verify) and routes, then the tool registry T053 (closes the it.todo in tests/bypass/gate.test.ts), cart routes T055 + their contract tests T048.

## Money core facts
- `lib/check/run.ts` runMandateCheck: pure; rows = safeguards (integrity, status, currency) + terms (budget, category, size, colors, [brands], merchant, expiration, purchases, semantic:*). Canvas: Daily Miler 7/7 pass $103.92; Tempo Racer fails budget + colors.
- `lib/payments/gate.ts` payCart/checkCart: semantic judged before the lock (fails closed), then lockMandate, re-read, check pre_create, vault charge (request id = check id, custom_id `CODE:v:sha256`, invoice `CODE.orderCode`), pre_capture check before any separate capture, outage leaves cart `checked_not_paid`. Hash mismatch flags the mandate.
- `lib/payments/paypal-money.ts` (vault charge with stored_credential MERCHANT/SUBSEQUENT/UNSCHEDULED_PREPAID, payee merchant_id) is internal; `lib/payments/deps.ts` wires production deps.
- Static bypass checks: no import of paypal-rest/paypal-money and no PayPal order endpoints outside lib/payments; Agent Toolkit only in lib/payments/toolkit.ts.

## Phase 2 facts (keyless part)
- DB: Drizzle schema `lib/db/schema.ts` + SQL migration `lib/db/migrations/0000_init.sql`. Local dev and tests use PGlite (no Docker/Postgres needed): `DATABASE_URL` empty = `.data/pglite`, `pglite:memory` in tests (`tests/helpers/db.ts`). Render uses postgres-js; `pnpm db:migrate` there.
- Catalog: 3 fictional stores, 28 products in `lib/catalog/data.ts` (Daily Miler $96 → $103.92, Tempo Racer → $127.74, as in the canvas).
- Session: `proxy.ts` (Next 16 name for middleware) sets signed httpOnly `mandate_sid`; `getSession()` upserts the row.
- Model: official `@anthropic-ai/sdk` (NOT Vercel AI SDK, per Claude API guidance), `claude-sonnet-5-5`, `client.beta.messages.parse` + `betaZodOutputFormat`, refusal fallback `fallbacks: "default"` (beta server-side-fallback-2026-07-01), cap 40/session/day.
- PayPal transport `lib/payments/paypal-rest.ts` (sandbox guard, token cache, retries) is INTERNAL to lib/payments.
- Canonical hash `lib/mandate/canonical.ts` + terms schema `lib/mandate/terms.ts`; pricing `lib/pricing`.
- UI: `components/ui` (Button, Tag, Money, MonoId, TermRow), `components/shell` (Public/Buyer/Merchant headers, Footer, PageFrame); `/privacy` live.
- Tests: 42 Vitest green; Playwright 8 green. With the preview server on 3100, run `E2E_BASE_URL=http://localhost:3100 pnpm e2e`.

## Phase 1 facts
- Next.js 16.4.2 (cacheComponents on, `AGENTS.md`: read `node_modules/next/dist/docs/` before coding), React 19.3, pnpm 9.15, Node 24 locally.
- Scripts: `pnpm dev|build|typecheck (next typegen && tsc)|lint|test (vitest)|e2e (playwright desktop+Pixel 7)|scan:secrets`. Pre-push hook `.githooks/pre-push` (core.hooksPath set).
- Tokens in `app/globals.css` (light = canvas exact, dark derived). Icons: Phosphor via `components/ui/icons.tsx`; brand mark `components/ui/Mark.tsx`; favicons in `app/` (icon.svg adapts to dark, favicon.ico 16+32, apple-icon 180).
- Preview: config `mandate-dev` (port 3100) in `D:\claude\.claude\launch.json`.
- Leftover temp folder `D:\claude\mandate-scaffold` (safe to delete; deletion was blocked for me).

## Analysis fixes applied (2026-10-17)
tasks.md is now T001..T109: pre-push secret scan (T008), privacy page moved to Phase 2 (T035), approval fallback task (T052), new Phase 5b MVP deployment (render.yaml, bundle scan, first deploy, uptime check), dispute latency test (SC-006); spec FR-022 adds "awaiting PayPal link"; data model adds cart `checked_not_paid` and `mandate.flagged_at`.

## Previous step
Plan done: `specs/001-agent-purchase-mandates/` has plan.md, research.md, data-model.md, contracts/ (consent-gate, http-api, sandbox-scripts), quickstart.md. Next: `speckit-tasks`, then `speckit-analyze`. User is creating PayPal sandbox credentials (`docs/sandbox-setup.md`); Vault must be enabled in the sandbox app.

## Key research outcomes (2026-10-17)
- Vault: JS SDK v6 `createPayPalSavePaymentSession` + `/v3/vault/setup-tokens` + `/v3/vault/payment-tokens`; charge with Orders v2 `payment_source.paypal.vault_id` + `stored_credential {payment_initiator: MERCHANT, usage: SUBSEQUENT}`.
- RISK: charging a vaulted wallet to another payee (3 stores) may be refused; script 03 decides; fallback = one merchant account.
- custom_id max 255 → `MDT…:v:sha256`. Disputes: create only manually as sandbox buyer (API needs account manager scopes); sandbox `require-evidence` + `adjudicate` exist; evidence multipart.
- Agent Toolkit `@paypal/agent-toolkit`: no vault, no provide-evidence → REST.
- AG Grid prize wants AG Studio + Studio Agent Framework + custom widgets; 45-day trial → activate on/after 2026-11-01. Boilerplate: paypaldev/hackathon-paypal-ag-grid-boilerplate.
- Render: $50 credits (credits-portal-mmdm.onrender.com/claim/paypal-ai-hackathon), Workflows featured → evidence task. Free Postgres expires 30 days.

## Clarifications (2026-10-17, in spec)
- Agent pays alone: PayPal linked once at signing (saved payment method via official button), then server side payments behind the Mandate check. Fallback: buyer approves each payment. Must be proven in `/scripts` first.
- Budget = total for the whole mandate (tax + shipping), each order fits in the remainder.
- Dispute pool: ~10 real sandbox disputes opened ~Dec 1, refreshed once mid judging; one per demo session; read only fallback.
- Model cap: ~40 calls per session per day + global daily ceiling; capped semantic check = not passed.
- New session: empty history + one action prefilling the running shoes example.

## Decisions (2026-10-17)
- Hosting: Render web service + Render Postgres, paid Starter plans until 2026-12-15 (free Postgres expires ~30 days).
- Access: no accounts; cookie demo session per visitor, buyer and merchant views switchable. Judges only need the sandbox buyer login.
- Stores: 3 fictional catalogs (Sample Sports Outlet, Example Running Co., Demo Shoe Supply), each paid to its own sandbox business account via `payee`; merchant dashboard = Sample Sports Outlet.
- Disputes: real sandbox dispute procedure documented + one real dispute opened in advance and kept for judges.
- Landing sources: the 3 brief sources + the American Banker line already in the design.
- Footer "© 2026 Mandate"; privacy contact = GitHub issues of the public repo; retention 90 days.
- PayPal setup not done yet: guide in `docs/sandbox-setup.md`.

## Done
- 2026-10-17: Spec Kit runtime installed in `.specify/`, git repo initialised (branch `main`, nothing committed).
- 2026-10-17: Design canvas pulled from https://claude.ai/artifact/N1EUgGcrmhMDC3QVpZsZoH into `design/project/` (10 boards: Main, MandateCreate, AgentChat, MandateCheck, Blocked, History, MerchantOrders, DisputeDetail, Privacy, System).
- 2026-10-17: `.specify/memory/constitution.md` v1.0.0 (7 principles, consent gate non negotiable).

## Next
1. Answers to the open questions (hosting, buyer identity, merchants, dispute simulation, credentials).
2. `speckit-specify` → `speckit-clarify` → `speckit-plan` → `speckit-tasks` → `speckit-analyze` → `speckit-implement`.
3. Sandbox scripts in `/scripts` before app code.

## Design notes (from the canvas)
- Tokens: Geist + Geist Mono; ink #121518, ink2 #454A50, ink3 #61676D, control border #AEB3AD, hairline #D7DAD6, ground #F4F5F3, surface #FBFBFA; radius 4px (tags 3px).
- States: Compliant #14612F/#E2EFE5, Blocked #983809/#F9E9DE, In dispute #1C4399/#E4EAF6, Resolved #3E434A/#E6E8E9, Awaiting #6A5000/#F3EBCF.
- Gaps vs brief: landing cites American Banker, not the 3 required sources; 3 fictional stores in the agent chat vs one demo store; merchant table must become AG Grid; no screens for revocation confirm, re-sign after amendment, mobile.
