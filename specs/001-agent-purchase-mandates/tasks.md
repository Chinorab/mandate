---

description: "Task list for Agent Purchase Mandates (Mandate)"
---

# Tasks: Agent Purchase Mandates

**Input**: Design documents from `/specs/001-agent-purchase-mandates/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (consent-gate, http-api, sandbox-scripts), quickstart.md

**Tests**: Required. Constitution principle VI makes money path tests test first, and every journey needs
Playwright coverage on desktop and mobile before each deploy.

**Organization**: grouped by user story (spec.md priorities). Paths are at the repository root (single
Next.js project, see plan.md Project Structure).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 to US7 from spec.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: project initialization, tooling, design tokens

- [X] T001 Scaffold Next.js 16 App Router + TypeScript strict + pnpm at the repo root (app/, components/, lib/, tests/), keeping design/, docs/, specs/, .specify/ untouched; package.json scripts dev, build, start, test, e2e, db:migrate, db:seed, scan:secrets
- [X] T002 [P] Add .gitignore (env files, .scripts-state/, playwright artifacts, .next) and .env.example listing every variable from docs/sandbox-setup.md plus SESSION_SECRET, AG_STUDIO, RENDER_API_KEY, MODEL_DAILY_GLOBAL_CAP, all empty
- [X] T003 [P] Add LICENSE (MIT, "Copyright (c) 2026 Mandate contributors")
- [X] T004 [P] Configure ESLint + Prettier + tsconfig paths (@/lib, @/components) in eslint.config.mjs, .prettierrc, tsconfig.json
- [X] T005 [P] Configure Vitest (node env, coverage) in vitest.config.ts with tests/unit, tests/contract, tests/bypass
- [X] T006 [P] Configure Playwright with Desktop Chrome and Pixel 7 projects, baseURL from env, in playwright.config.ts and tests/e2e/
- [X] T007 [P] Add secret scan script (gitleaks via npx or a regex scanner over tracked files) in scripts/scan-secrets.ts wired to pnpm scan:secrets
- [X] T008 [P] Git pre-push hook running pnpm scan:secrets (.githooks/pre-push, core.hooksPath set by the prepare script) in .githooks/pre-push and package.json
- [X] T009 Load design skills (design-taste-frontend, web-design-guidelines, design-md-library, image-to-code) and extract tokens from design/project/System.dc.html into app/globals.css (CSS variables: ink, ink2, ink3, control border, hairline, ground, surface, state pairs, radius 4px/3px, Geist + Geist Mono via next/font)
- [X] T010 [P] Create icon set (check circle, octagon, flag, square check, clock, shield, slashed circle, info, pencil, arrow) mapped from Phosphor (taste skill bans hand drawn icons) in components/ui/icons.tsx, brand mark in components/ui/Mark.tsx
- [X] T011 [P] Create favicon set from the System board mark: app/icon.svg, app/favicon.ico (16, 32), app/apple-icon.png (180)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: prove the PayPal sandbox behaviors, then build shared infrastructure. No user story starts
before this phase ends. Sandbox scripts follow contracts/sandbox-scripts.md and need the user's sandbox
credentials in .env.local.

### Sandbox proof (decides research R1, R2, R5)

- [X] T012 Create PayPal REST helper for scripts (OAuth token cache, sandbox base URL guard that throws on any live URL, redacting logger) in scripts/lib/paypal.ts
- [X] T013 Script 01: create + capture order with custom_id, invoice_id, description and PayPal-Request-Id replay; log to scripts/LEARNINGS.md, in scripts/01-auth-and-order.ts
- [X] T014 Script 02 (approval link instead of a local SDK page; the app's SDK flow is checked in T043): vault setup token, local static page using JS SDK v6 createPayPalSavePaymentSession, payment token creation; store ids in .scripts-state/ (gitignored), in scripts/02-vault-setup.ts and scripts/02-vault-page.html
- [X] T015 Script 03: merchant initiated charge with vault_id + stored_credential to each of the 3 payees; record outcome and the R2 decision in scripts/LEARNINGS.md, in scripts/03-vault-charge-payee.ts
- [X] T016 (done through the app's own route /api/webhooks/paypal behind a cloudflared tunnel; real capture and dispute events verified, unsigned bodies refused) Script 04: webhook listener behind a cloudflared tunnel, verify-webhook-signature for real capture and vault events, tampered body check, in scripts/04-webhook-listener.ts
- [X] T017 (done through the app: dispute opened by the sandbox buyer, evidence submitted from the dispute page, PayPal UNDER_REVIEW) Script 05: open a dispute manually as sandbox buyer (write exact click steps), then list it, require-evidence if UNDER_REVIEW, provide-evidence multipart (PDF + notes + tracking), in scripts/05-dispute.ts
- [X] T018 [P] Script 06: Agent Toolkit get_order, list_disputes, get_dispute, create_shipment_tracking in sandbox, in scripts/06-toolkit.ts
- [X] T019 [P] Script 07: delete payment token then attempt a charge (must fail), in scripts/07-revoke.ts
- [ ] T020 Record decisions from T013 to T019 in research.md (R1, R2, R5 marked confirmed or fallback) and docs/dispute-pool-runbook.md (manual dispute steps, pool refill dates)

### Shared infrastructure

- [X] T021 Define Drizzle schema for all tables in data-model.md (demo_session, mandate, mandate_version, store, product, cart, check_result, order, dispute, evidence_file, paypal_event, audit_log) in lib/db/schema.ts with migrations in lib/db/migrations/
- [X] T022 [P] DB client and transaction helper with row locking utility in lib/db/client.ts
- [X] T023 [P] Seed 3 fictional stores and about 30 products (running shoes and a few other categories, fictional names, tax rates, shipping) in lib/db/seed.ts; payee ids from env
- [X] T024 [P] Demo session: signed httpOnly cookie, creation in proxy.ts (Next 16 renamed middleware), getSession() in lib/session/index.ts
- [X] T025 [P] Model usage cap (40 per session per day + global daily cap) in lib/ratelimit/model.ts
- [X] T026 [P] Production PayPal REST transport (OAuth cache, sandbox guard, request ids, typed errors, browser client token) in lib/payments/paypal-rest.ts, internal to lib/payments/
- [X] T027 [P] Anthropic model setup via the official SDK (@anthropic-ai/sdk, claude-sonnet-5-5, refusal fallback) wrapped with the usage cap in lib/ai/model.ts
- [X] T028 [P] Audit log writer in lib/audit/index.ts
- [X] T029 [P] Unit tests for canonicalization and hashing (key order, id arrays, dates, same terms same hash, one change different hash) in tests/unit/canonical.test.ts
- [X] T030 Terms zod schema, canonicalize(), sha256 in lib/mandate/terms.ts and lib/mandate/canonical.ts (make T029 pass)
- [X] T031 [P] Unit tests for computeTotals (tax, shipping, free shipping threshold, cents rounding) in tests/unit/pricing.test.ts
- [X] T032 computeTotals from product rows only in lib/pricing/index.ts (make T031 pass)
- [X] T033 [P] App shell: buyer header (Mandates, History, Account), merchant header (Orders, Disputes, Insights, Settings), view switcher, footer with "© 2026 Mandate" and non affiliation line, in components/shell/
- [X] T034 [P] UI primitives from the canvas: Button (primary, secondary, danger, disabled), Tag (state pairs with icon + label), TermRow, Money (tabular), Mono id, in components/ui/

- [X] T035 [P] Privacy page from design/project/Privacy.dc.html (contact = GitHub issues link, retention 90 days, providers Render, PayPal, Anthropic) in app/(public)/privacy/page.tsx, so privacy and favicon exist before any deployment (constitution VII)

**Checkpoint**: sandbox behaviors known and documented, foundation ready.

---

## Phase 3: User Story 1 - Sign a mandate from plain words (Priority: P1) MVP

**Goal**: plain words to explicit terms, edit, sign, fingerprint, link PayPal, active.

**Independent Test**: create from a sentence, edit a term, sign, link PayPal; mandate active with signature
time and fingerprint; /verify returns match.

### Tests for User Story 1

- [X] T036 [P] [US1] Contract tests for draft, patch, sign, verify, vault setup-token, vault confirm routes (PayPal and model mocked) in tests/contract/mandate-routes.test.ts
- [X] T037 [P] [US1] Sign refuses missing budget, category or expiry; signed version immutable (patch returns 409); covered in tests/contract/mandate-routes.test.ts

### Implementation for User Story 1

- [X] T038 [US1] Draft extraction with structured output (terms + assumptions, "this week" = Sunday 11:59 PM ET, size system default flagged) in lib/mandate/draft.ts
- [X] T039 [US1] Mandate service: createDraft, updateDraft, sign (version 1, canonical, sha256, signed_at), verify, in lib/mandate/service.ts
- [X] T040 [US1] Vault link service: setup token (description names the mandate), confirm to payment token, store server side, activate, in lib/payments/vault.ts
- [X] T041 [US1] Route handlers per contracts/http-api.md (draft, patch, sign, verify, vault setup-token, vault confirm, client-token) in app/api/mandates/ and app/api/paypal/client-token/route.ts
- [X] T042 [US1] New mandate page matching design/project/MandateCreate.dc.html: instructions textarea with one tap example, terms card with inline edit per term, assumption notes, budget copy "total for this mandate", Sign Mandate, in app/(buyer)/mandates/new/page.tsx and components/mandate/
- [X] T043 [US1] PayPal link step after signing with JS SDK v6 save session (official button only), states for cancel and error, in components/mandate/LinkPayPal.tsx (written; needs sandbox keys to verify the start() promise shape and the button type)
- [ ] T044 [US1] E2E: create, edit size, sign, link PayPal with sandbox buyer, see Active + fingerprint, in tests/e2e/us1-sign.spec.ts (keyless part done: manual draft, edits, sign, fingerprint verify, reload, discard; linked path pending keys in tests/e2e/us1-link.spec.ts)

**Checkpoint**: US1 works alone.

---

## Phase 4: User Story 2 - Compliant purchase through PayPal (Priority: P1)

**Goal**: agent proposes, check passes term by term, agent pays alone, order carries the mandate.

**Independent Test**: with an active mandate, agent buys a matching item; check 7 of 7; order captured with
custom_id at PayPal.

### Tests for User Story 2 (write first, must fail)

- [X] T045 [P] [US2] Unit tests for runMandateCheck: every term row, all rows always produced, explanation templates, semantic missing or capped = fail, in tests/unit/check.test.ts
- [X] T046 [P] [US2] Bypass suite per contracts/consent-gate.md: registered tool lists, static import scan of money functions outside lib/payments/, refusals (revoked, expired, budget, count, merchant, forbidden, semantic fail, semantic unavailable, hash mismatch, canonical tamper, other session cart, superseded version), client totals ignored, in tests/bypass/gate.test.ts (the registered tool list check is an it.todo until T053 lands)
- [X] T047 [P] [US2] Concurrency test: two parallel payCart with one remaining purchase yield one order, in tests/bypass/concurrency.test.ts
- [X] T048 [P] [US2] Contract tests for check and pay routes (409 refusal shape, PayPal mock zero calls on refusal) in tests/contract/cart-routes.test.ts

### Implementation for User Story 2

- [X] T049 [US2] runMandateCheck pure function and explanation templates in lib/check/run.ts and lib/check/explain.ts (make T045 pass)
- [X] T050 [US2] Semantic verdicts with structured output, cache 10 minutes per cart and version, fail closed, in lib/check/semantic.ts (tests in tests/contract/semantic.test.ts)
- [X] T051 [US2] Consent gate payCart: lock mandate, recompute totals, check pre_create, vault charge with custom_id, invoice_id, description, payee, PayPal-Request-Id, check pre_capture, capture if needed, persist; on PayPal outage leave the cart checked_not_paid with a retry; on hash mismatch set mandate.flagged_at and refuse; in lib/payments/gate.ts (make T046 to T048 pass)
- [ ] T052 [US2] (not needed: vault charges confirmed in the sandbox, see research R1 and R2) Per payment approval fallback, built only if T020 records that vault charges fail: PAYMENT_MODE=approve flag, check page renders the official SDK button only after a passing check, server create order runs the pre_create check and capture runs the pre_capture check through the same gate, bypass suite extended to this mode, in lib/payments/gate.ts, components/check/ApprovePayment.tsx, tests/bypass/gate-approve-mode.test.ts
- [X] T053 [US2] Agent tool registry (search_catalog, present_options, add_to_cart, check_cart, pay_cart, order_status, get_order via Agent Toolkit) with the money tool allowlist assertion, in lib/agents/tools.ts and lib/payments/toolkit.ts (tests/bypass/tools.test.ts)
- [X] T054 [US2] Shopping agent (Anthropic SDK tool runner, bounded steps, fit labels per proposal, catalog text treated as data) in lib/agents/shopping.ts and app/api/agent/chat/route.ts
- [X] T055 [US2] Cart routes check and pay in app/api/carts/[id]/check/route.ts and app/api/carts/[id]/pay/route.ts
- [X] T056 [US2] Agent chat page matching design/project/AgentChat.dc.html (mandate sidebar with budget left, product cards with fit tags, Review Mandate Check) in app/(buyer)/mandates/[code]/page.tsx and components/agent/
- [X] T057 [US2] Check page matching design/project/MandateCheck.dc.html (term table, totals against remaining budget, payment status instead of the button, "attached to the order" note) in app/(buyer)/mandates/[code]/check/[cartId]/page.tsx and components/check/
- [ ] T058 [US2] E2E: agent proposes 3 items, pick the compliant one, 7 of 7, paid, order shows custom_id via get_order, in tests/e2e/us2-compliant.spec.ts (keyless part done in tests/e2e/us2-agent.spec.ts with the dev scenario; the live agent and PayPal path needs keys)

**Checkpoint**: US1 + US2 = demo MVP.

---

## Phase 5: User Story 3 - Blocked purchase, amend or cancel (Priority: P1)

**Goal**: blocked before payment, failed terms explained, amend with new version and hash, switch, or cancel.

**Independent Test**: non compliant cart cannot be paid by any path; amend then pay; or cancel.

### Tests for User Story 3

- [X] T059 [P] [US3] Unit tests for amendment (only listed terms differ, new version_no, new sha256, previous link, cart repinned) in tests/unit/amend.test.ts
- [X] T060 [P] [US3] Contract tests for amend and cancel routes in tests/contract/amend-routes.test.ts

### Implementation for User Story 3

- [X] T061 [US3] Amendment service: minimal change proposal from failed terms, approve creates version n+1, in lib/mandate/amend.ts
- [X] T062 [US3] Compliant alternative finder (cheapest passing product in allowed stores) in lib/check/alternative.ts
- [X] T063 [US3] Amend, options, switch and cancel routes in app/api/carts/[id]/{amend,options,switch,cancel}/route.ts (handlers in lib/api/amend.ts)
- [X] T064 [US3] Blocked page matching design/project/Blocked.dc.html (failed terms, totals, Widen the mandate with explicit approval checkbox, Switch to alternative, Cancel Purchase) in components/check/BlockedOptions.tsx, shown by components/check/CheckPage.tsx
- [X] T065 [US3] E2E: over budget and forbidden color cart is blocked; direct POST to pay returns 409; amend and pay; separate run cancel, in tests/e2e/us3-blocked.spec.ts

**Checkpoint**: all P1 stories done.

---

## Phase 5b: MVP deployment

**Purpose**: put the P1 thesis on the real host early so webhooks and judge paths are tested there. Gate:
unit + bypass + e2e green, secret scans clean, privacy page and favicon present.

- [X] T066 (plans 0.5c-512mb web and 0.1c-256mb Postgres; Workflows service deferred with T092) render.yaml (web service Starter, Postgres Basic, env groups, Workflows service), health route app/api/health/route.ts
- [X] T067 [P] Client bundle secret scan after next build (fails if PAYPAL_CLIENT_SECRET, ANTHROPIC_API_KEY, SESSION_SECRET values or the vault token field names appear in .next/static) in scripts/scan-bundle.ts wired into pnpm build:check
- [ ] T068 First deploy to Render, register the hosted webhook URL in the sandbox app, run US1 to US3 e2e against the hosted URL
- [X] T069 [P] (active once the repository variable DEMO_URL is set) Uptime check until 2026-12-15: scheduled GitHub Actions workflow pinging /api/health every 30 minutes and opening an issue on failure, in .github/workflows/uptime.yml

---

## Phase 6: User Story 4 - Revoke, history and receipt (Priority: P2)

**Goal**: history with statuses and activity, revoke at any time, receipt download.

**Independent Test**: revoke with a passing cart pending; pay refused; receipt downloads.

- [X] T070 [P] [US4] Contract tests for revoke, list, receipt routes in tests/contract/history-routes.test.ts
- [X] T071 [US4] Revoke service (status, revoked_at, delete vault token, audit) in lib/mandate/revoke.ts and app/api/mandates/[code]/revoke/route.ts
- [X] T072 [US4] Receipt PDF (instructions, terms per version, signature times, fingerprints, orders and blocks) in lib/mandate/receipt.ts and app/api/mandates/[code]/receipt/route.ts
- [X] T073 [US4] History page matching design/project/History.dc.html (filters All, Active, Expired, Revoked; detail panel; activity table; receipt preview; empty state with one tap example) in app/(buyer)/history/page.tsx and components/history/
- [X] T074 [US4] E2E: revoke flow and receipt download in tests/e2e/us4-history.spec.ts

---

## Phase 7: User Story 5 - Merchant view of agent orders (Priority: P2)

**Goal**: AG Grid Enterprise orders view and AG Studio insights for Sample Sports Outlet.

**Independent Test**: find a fresh order by mandate id, filter, group, expand, export, add tracking.

- [X] T075 [P] [US5] Contract tests for merchant orders and tracking routes (masked buyer, no other session data) in tests/contract/merchant-routes.test.ts
- [X] T076 [US5] Orders query with masking in lib/merchant/orders.ts and app/api/merchant/orders/route.ts
- [X] T077 [US5] AG Grid theme from tokens (Theming API) in components/merchant/grid/theme.ts
- [X] T078 [US5] Custom cell renderers: status tag, mandate id with fingerprint popover, check score, dispute status, PayPal id mono, in components/merchant/grid/cells/
- [X] T079 [US5] Orders grid matching design/project/MerchantOrders.dc.html: search, set filters, sorting, row grouping (status, mandate state, day), master detail (terms + check table), status bar, CSV and Excel export, in components/merchant/grid/OrdersGrid.tsx and app/(merchant)/merchant/page.tsx
- [X] T080 [US5] Tracking (inline form in the detail row instead of a dialog; reported through the Toolkit only when PayPal keys are set): route calling Agent Toolkit create_shipment_tracking, in components/merchant/TrackingDialog.tsx and app/api/merchant/orders/[code]/tracking/route.ts
- [ ] T081 [US5] AG Studio insights: provider with AG_STUDIO license, custom widgets "Mandate coverage", "Blocked before payment", "Dispute exposure by mandate state", in app/(merchant)/merchant/insights/page.tsx and components/merchant/studio/
- [ ] T082 [US5] Studio Agent Framework wired to a capped Claude endpoint, in components/merchant/studio/agent.ts and app/api/merchant/studio/agent/route.ts
- [X] T083 [US5] E2E: merchant grid filter, group, expand, export file content, tracking saved, in tests/e2e/us5-merchant.spec.ts

---

## Phase 8: User Story 6 - Dispute answered with the mandate (Priority: P2)

**Goal**: verified webhook, evidence file, factual draft, review, confirm, submit, pool claim.

**Independent Test**: claim a pool dispute, edit, confirm, submit, PayPal accepts.

### Tests for User Story 6

- [X] T084 [P] [US6] Webhook tests: valid signature processed once, duplicate ignored, invalid signature rejected with no side effect, in tests/contract/webhook.test.ts
- [X] T085 [P] [US6] Draft grounding test: every sentence maps to an included evidence item; no mandate order produces "no mandate attached"; excluded items are not cited, in tests/unit/dispute-draft.test.ts
- [X] T086 [P] [US6] Integration test: from a verified dispute event to a stored evidence file and draft in under 60 s (SC-006), model mocked with realistic latency, in tests/contract/dispute-latency.test.ts
- [X] T087 [P] [US6] Submit guard tests: non claimant 403, missing accuracy confirmation 400, PayPal rejection keeps draft, in tests/contract/dispute-submit.test.ts

### Implementation for User Story 6

- [X] T088 [US6] Webhook route with signature verification (in lib/payments/webhooks.ts, since it calls PayPal REST), event store, dispatch, in lib/webhooks/dispatch.ts, app/api/webhooks/paypal/route.ts
- [X] T089 [US6] Evidence assembly from stored records (mandate, version, hash, timestamps, check, order, tracking) in lib/disputes/assemble.ts
- [X] T090 [US6] Evidence PDF report in lib/disputes/report-pdf.ts
- [X] T091 [US6] Grounded draft (structured output: sentences with item keys, server rejects unmapped sentences) via the merchant agent using Agent Toolkit get_dispute, in lib/disputes/draft.ts and lib/agents/merchant.ts
- [ ] T092 [US6] (inline part done: lib/disputes/enqueue.ts runs after the response with one retry; the Render Workflows task comes with phase 5b) Render Workflows task assembleEvidence (assemble + draft) with inline fallback, in workflows/assemble-evidence.ts and lib/disputes/enqueue.ts
- [X] T093 [US6] (multipart part names to confirm with the sandbox scripts) Submit via provide-evidence multipart (BILLING_AGREEMENT with PDF, PROOF_OF_FULFILLMENT with tracking, notes), in lib/disputes/submit.ts and app/api/merchant/disputes/[id]/submit/route.ts
- [X] T094 [US6] Pool claim and evidence routes in lib/disputes/pool.ts, app/api/merchant/disputes/claim/route.ts, app/api/merchant/disputes/[id]/route.ts, app/api/merchant/disputes/[id]/evidence/route.ts
- [X] T095 [US6] (written and guarded; first real run needs PayPal keys) Pool import script for operator (sync open sandbox disputes into the pool) in scripts/pool-sync.ts
- [X] T096 [US6] Dispute page matching design/project/DisputeDetail.dc.html (timeline, evidence items with include toggles and View, editable response, accuracy checkbox, Save Draft, Submit Evidence, read only state) in app/(merchant)/merchant/disputes/[id]/page.tsx and components/dispute/
- [ ] T097 [US6] (keyless part done in tests/e2e/us6-dispute.spec.ts with development disputes; the @pool sandbox run needs keys) E2E: claim, edit, confirm, submit against a sandbox dispute (tagged @pool, skipped when pool empty) in tests/e2e/us6-dispute.spec.ts

---

## Phase 9: User Story 7 - Public surface (Priority: P3)

**Goal**: landing with sourced context, privacy page, demo access without sign up.

**Independent Test**: fresh browser on phone and desktop reaches a signed mandate without sign up; privacy reachable.

- [X] T098 [P] [US7] Landing matching design/project/Main.dc.html with example mandate figure and a sources strip linking the 3 brief sources and American Banker, in app/page.tsx (copy and sources in lib/landing/content.ts)
- [X] T099 [US7] Session isolation test: two contexts never see each other's mandates in tests/e2e/us7-public.spec.ts

---

## Phase 10: Polish and Cross-Cutting Concerns

- [ ] T100 [P] Content audit against principle VII (no dashes in visible copy, no emojis, no AI wording in UI, no pill buttons, no gradients) with a script over app/ and components/ in scripts/content-audit.ts
- [ ] T101 [P] Accessibility and UI review with the web-design-guidelines skill; fix findings across components/
- [ ] T102 [P] Loading, empty and error states for model cap, PayPal down, empty pool, in components/ui/States.tsx
- [ ] T103 Final deploy to Render and full quickstart.md walkthrough on the hosted URL
- [ ] T104 README.md: problem with sources, architecture diagram, role of each PayPal API and of the Agent Toolkit (toolkit vs REST table), the consent gate and why it cannot be bypassed, What we learned from the sandbox (from scripts/LEARNINGS.md), local install, env vars, license
- [ ] T105 [P] DEVPOST.md: Inspiration, What it does, How we built it, PayPal + AI integration, Challenges, What's next
- [ ] T106 [P] VIDEO_SCRIPT.md: scene by scene, under 2:45, voice over: problem (20 s), compliant purchase, blocked purchase, dispute resolved with evidence; no copyrighted music, no third party marks except the PayPal button
- [ ] T107 Full Playwright run desktop + mobile, unit + bypass green, secret scan clean, before every deploy (gate)
- [ ] T108 Operator tasks: activate AG Studio 45 day trial on or after 2026-11-01; claim Render credits; open the dispute pool about 2026-12-01 and refresh before deadlines lapse (docs/dispute-pool-runbook.md)
- [ ] T109 Public GitHub repo with MIT license visible in About; testing instructions with the sandbox buyer login (never API secrets)

---

## Dependencies and Execution Order

- Phase 1 then Phase 2. T012 to T020 need the user's sandbox credentials; T021 onward can start in parallel
  with the sandbox scripts, but T040 and T051 wait for T014, T015 and T020.
- US1 (Phase 3) then US2 (Phase 4): US2 needs an active mandate. US3 needs US2's check and gate.
- US4 needs US1 (and US2 for activity). US5 needs orders (US2). US6 needs US5's merchant shell and real
  orders; T088 can start after Phase 2. US7 is independent after Phase 2.
- Phase 5b (MVP deployment) after US3; privacy page and favicon (Phase 1 and 2) make it allowed.
- Polish after the stories it covers; T107 before every deploy.

## Parallel Examples

- Phase 2: T022, T023, T024, T025, T026, T027, T028 together; T029 with T031.
- US2 tests: T045, T046, T047, T048 together, then T049 before T051.
- US5: T077 and T078 together, T081 alongside T079.
- US6 tests: T084, T085, T087 together.
- US7: T098 and T091 together.

## Implementation Strategy

1. MVP = Setup + Foundational + US1 + US2 + US3 (sign, pay inside, blocked outside): the core thesis, deployable.
2. Then US5 and US6 (merchant side, sponsor grid, disputes), then US4, then US7 and Polish.
3. Phase 5b deploys the MVP to Render so webhooks and judges' paths are tested on the real host early.
4. Target dates: MVP by 2026-10-28, merchant + disputes by 2026-11-05, polish, video and submission by
   2026-11-10 (two days of margin before 2026-11-12 12:00 PT).
