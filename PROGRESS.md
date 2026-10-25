# PROGRESS — Mandate (PayPal AI Hackathon)

Deadline: 2026-11-12 12:00 PT (Devpost `paypalaihackathon`). Demo must stay testable until 2026-12-15 08:00 PT.
Targets: Grand Prizes, Best Use of Agentic Commerce, AG Grid sponsor prize (Render prize if hosted on Render).

## Current step
Phase 5b DONE 2026-10-25: demo live at https://mandate-thsn.onrender.com (Render Blueprint: web 0.5c-512mb + Postgres 0.1c-256mb, paid by the $50 hackathon credits, about $18/month). /api/health ok and shows the last verified PayPal event; PayPal webhook (Mandate US app) points to https://mandate-thsn.onrender.com/api/webhooks/paypal and a resent PAYMENT.CAPTURE.COMPLETED was verified there; GitHub variable DEMO_URL set, uptime workflow green; public e2e green on the host; dev fixtures 404 in production. Local cloudflared tunnel stopped (local dev no longer receives PayPal events). Repo public: https://github.com/Chinorab/mandate. Next: AG Studio T081/T082 after 2026-11-01 (license key also in Render env, then redeploy), Render Workflows task for evidence assembly (T092, Render prize), video, Devpost submission before 2026-11-12 12:00 PT, dispute pool of about 10 real disputes on the hosted demo around Dec 1 (operator steps in README), delete the Render services after 2026-12-15.
T092 Render Workflows 2026-10-25: task `assembleEvidence` (workflows/assemble-evidence.ts, retries 3, timeout 300 s, idempotent), workflow service "mandate-evidence" in render.yaml (validated against Render's JSON schema), web gets RENDER_WORKFLOW_SLUG from the service slug; lib/disputes/queue.ts starts the task (idempotencyKey assemble-{id}) and falls back to the app if the start fails or no file exists after 120 s. Workflow start command needs `--conditions=react-server` (server-only modules). CONFIRMED on Render 2026-10-25 14:24 UTC: resent dispute event, evidence file built by the workflow 4 s later (/api/health lastEvidenceFile.assembledBy = workflow). /api/health also shows workflowConfig booleans and the last evidence file origin.
SUBMITTED on Devpost 2026-10-25 15:24 UTC (submission 1227257, devpost.com/software/mandate-xdenyb): video https://youtu.be/CUtU4nXVPLU, 9 gallery images + thumbnail, answers from DEVPOST.md (France, New, AG Grid + Render, rating 8, no contact, learning Significant, AI career value Yes), eligibility confirmed by the user, test buyer credentials typed by the user in the testing instructions. Edits stay possible until 2026-11-12 12:00 PT (resubmit with submit_project). Remaining: AG Studio T081/T082 after 2026-11-01 (then update the AG Grid answer), keep the demo up until 2026-12-15, dispute pool around Dec 1, keep the test buyer password unchanged (judges use it), delete Render services after 2026-12-15.

## Sandbox setup (2026-10-24)
- Keys in `.env.local`: REST app "Mandate US" owned by Sample Sports Outlet (sb-rru43s..., US). The first app "Mandate" (owned by the FR default account) is not used: tracking and disputes belong to the merchant that received the money. 3 US business accounts as stores, US personal test buyer (sb-iom64...). Anthropic key valid.
- App features needed: Save payment methods (else 403 on all Vault calls), Customer disputes, Transaction search.
- Scripts done: 01 (order, custom_id, idempotency, capture), 02 (vault save, test buyer approval link), 03 (agent pays 3 stores, COMPLETED in one call), 06 (toolkit: get_order, tracking, disputes, transactions), 07 (revoke: token deleted, charge refused). Findings in `scripts/LEARNINGS.md`; research R1, R2 confirmed; T052 not needed.
- The vault token of script 02 was deleted by script 07: rerun 02 (test buyer approval) before running 03 again.
- Bug fixed from the runs: the toolkit returns PayPal errors as content; `wrapToolkit` now throws ToolkitError, tracking reports "paypal_refused".
- pnpm packageExtensions gives @paypal/paypal-server-sdk tslib 2 (it only lists it as a dev dependency). Restart the dev server after `pnpm install`.
- cloudflared 2026.10.3 at `C:\Program Files (x86)\cloudflared\cloudflared.exe`; quick tunnel `cloudflared tunnel --url http://localhost:3100`, new URL on every run.
- Left: 04 webhook (tunnel + register the webhook on the Mandate US app, PAYPAL_WEBHOOK_ID), 05 dispute (open as the test buyer), T043 app LinkPayPal flow, T044/T058 live agent e2e, T020 runbook.

## Docs (2026-10-24)
- README.md (problem with sources, what it does, consent gate, architecture with mermaid, PayPal APIs vs Agent Toolkit, how Claude is used, AG Grid, "Open a sandbox dispute" at `#open-a-sandbox-dispute`, setup, env vars, tests, status, MIT), DEVPOST.md (story + an answer per Devpost form field), VIDEO_SCRIPT.md (13 shots, about 300 words of voice over, target 2:40).
- Placeholders to fill after the sandbox runs: README "What we learned from the sandbox", DEVPOST challenges and "What we learned", demo and video URLs, sandbox buyer login in testing instructions, PayPal rating, AG Grid experience.
- Sandbox dispute click path (Activity, the payment, Report a problem) is written from research and must be confirmed in the sandbox.
- Landing claim reworded "AI agents" to "shopping agents" (constitution VII bans AI mentions in product UI; docs may describe Claude).

## US7 facts
- Copy and sources live in `lib/landing/content.ts` (SOURCES, CLAIMS, COST_STAT, NYDFS_QUOTE, EXAMPLE); `tests/unit/landing-sources.test.ts` pins the 4 URLs, the statistic and the example fingerprint. Sources read on 2026-10-24: Merchant Cost Consulting (Matt Rej, Oct 10 2026; WebFetch gets 403, curl with a browser user agent works), Chargeflow liability (Jul 7 2026), Chargeflow evidence playbook (Jul 19 2026), American Banker (Jun 26 2026, acting Superintendent quote).
- The statistic ($36.9 billion in 2026 to $46.1 billion in 2029) is Mastercard research by Datos Insights as reported by Chargeflow, and is labelled so. "Close calls favor the cardholder" is attributed as the author's expectation.
- The example card says "Signed", not "Active": its expiry (Oct 25 2026) is fixed, so "Active" would turn false.
- The landing is static (no session read); `app/page.tsx` stays at the root, not under `(public)`.
- E2E: AG Grid and amend options can duplicate row names, so scope row locators to their region.

## US6 facts
- Webhook: `app/api/webhooks/paypal/route.ts` → `lib/webhooks/dispatch.ts` (`handlePayPalWebhook`, `processEvent`). Verify with `lib/payments/webhooks.ts` (verify-webhook-signature, only SUCCESS trusted, cert URL must be paypal.com). Unverified = 400 and nothing stored (deliberate deviation from the first data model). Event id stored once; a failed processing is retried on PayPal's redelivery.
- Order match: dispute `disputed_transactions[].seller_transaction_id` = our capture id, or `custom` = our custom_id. `in_pool` = order of Sample Sports Outlet.
- Evidence: `lib/disputes/items.ts` (items with facts + missing list, fixed wording), `draft.ts` (template draft, grounding check: keys must be known and included, every number / upper case id / hex in a sentence must be in the cited facts; `composeResponse` filters by included items and adds the closing), `assemble.ts` (once per dispute), `lib/agents/merchant.ts` (Claude drafter, global cap only via `sessionId: null`; < 2 grounded sentences or refusal → template; `readDispute` via toolkit get_dispute).
- Submit: `lib/disputes/submit.ts` locks the dispute row, claimant + accuracy + included item + response ≤ 2000 chars, BILLING_AGREEMENT with the report PDF + notes, PROOF_OF_FULFILLMENT with tracking if included; rejection keeps the draft and stores PayPal's reason. `lib/payments/disputes.ts` = provide-evidence (multipart `input` + `file1`), list, get, require-evidence.
- Pool: `lib/disputes/pool.ts` (own claim first, else oldest due unclaimed with `FOR UPDATE SKIP LOCKED`, else latest submitted read only).
- UI: `components/dispute/{DisputePage,ClaimDispute}.tsx`, pages `/merchant/disputes` (claims, redirects) and `/merchant/disputes/[id]`; report PDF at `/api/merchant/disputes/[id]/report`. Grid detail row links to the dispute with a plain `<a>` (AG Grid cancels clicks inside detail rows, so `next/link` did nothing).
- Dev fixture: `{kind: "dispute"}` → 3 disputes (DEVPPD ids) through `processEvent`, first claimed by the caller; `devDisputesClient` accepts only DEVPPD ids, only with dev scenarios on.
- PDF writer shared by receipt and report: `lib/pdf/writer.ts`. Migration 0003 adds `evidence_file.draft_context`, `drafted_by`.
- E2E pitfall: Next keeps the previous route mounted but hidden, so use `main:visible`; AG Grid can keep detached row nodes, so check visible cells.

## US5 facts
- `lib/merchant/orders.ts`: `MERCHANT_STORE_ID = "sports-outlet"`, `maskBuyer(sessionId)` ("Buyer XXXX" from sha256, also used by the gate), `listMerchantOrders`.
- `lib/api/merchant.ts`: `listOrders`, `addTracking` (carrier UPS/USPS/FEDEX/DHL/ONTRAC, number `^[A-Z0-9]{8,34}$`, captured orders of this store only, Toolkit `create_shipment_tracking` when keys exist, else saved and reported false). Routes GET `/api/merchant/orders`, POST `/api/merchant/orders/[code]/tracking`.
- `components/merchant/grid/`: `theme.ts` (themeQuartz.withParams on CSS vars), `cells.tsx`, `DetailRow.tsx`, `OrdersGrid.tsx`.
- AG Grid pitfalls: `groupDefaultExpanded` also opens master detail rows, use `isGroupOpenByDefault` on group nodes; no `new Date()` during render (cacheComponents), export file name is computed on click; the detail row must not have `height: 100%` with `detailRowAutoHeight`; column virtualization hides off screen cells on mobile, so `suppressColumnVirtualisation` is on and the Order column is pinned left (one order = two `.ag-row` elements sharing `row-id`).
- License: `NEXT_PUBLIC_AG_GRID_LICENSE_KEY` (unset = watermark plus console banner, counted by the Next dev overlay as "Issues").
- Dev fixture: POST `/api/dev/scenario` `{kind: "merchant"}` creates 8 paid orders through the real gate with a dev money client (ids prefixed DEV).

## US4 facts
- `lib/mandate/revoke.ts`, `lib/mandate/activity.ts`, `lib/mandate/summary.ts` (termsSentence shared by preview and PDF), `lib/mandate/receipt.ts` (renderReceipt).
- Routes: POST `/api/mandates/[code]/revoke`, GET `/activity`, GET `/receipt` (application/pdf download).
- Concurrency test proves no capture after revoked_at. Dev server needed a restart once after export changes (stale Turbopack module).
- Receipt PDFs can be checked visually with `uvx --with pypdfium2 --with pillow python -I render_pdf.py` (scratchpad script).

## US3 facts
- `lib/mandate/amend.ts` proposeAmendment (pure): budget rounded up in $10 steps over spent + cart, colors add or unforbid, size, category, merchant add, brands, purchases, expiry to tomorrow 11:59 PM ET, failed preference removed; safeguard failures are not amendable.
- `lib/api/amend.ts`: getOptions (no model call, reuses recorded semantic verdicts), approveAmendment (lock, recompute, hash must match, insert version with previous link + change summary + amended_for_cart_id, repin cart, audit, re-check), switchToAlternative (`lib/check/alternative.ts`, cheapest passing product, currently Pace Lite $92.47).
- Gate exports read only helpers `loadCartContext` and `evaluateCart`.
- UI: `components/check/BlockedOptions.tsx` (Widen the mandate with approval checkbox, Keep the mandate as is / Switch to X, Cancel Purchase).

## US2 facts
- Tools (`lib/agents/tools.ts`): search_catalog (fit labels from the deterministic check, `lib/agents/fit.ts`), present_options, add_to_cart, check_cart, pay_cart (= payCart), order_status, get_order (Agent Toolkit, only for orders on this mandate, only when PayPal keys exist).
- Agent Toolkit (`lib/payments/toolkit.ts`): `@paypal/agent-toolkit/openai` entry used provider neutral (getTools + handleToolCall); actions enabled: orders.get, disputes.list/get, shipment.create/get, transactions.list; money tools refused by name.
- Agent (`lib/agents/shopping.ts`): claude-sonnet-5-5, max 8 iterations, refusal fallback, transcript in table `agent_thread` (migration 0002), open tool calls closed at the step limit. Display mapping `lib/agents/transcript.ts` + `display.ts`.
- Dev only fixture: POST `/api/dev/scenario` (needs `MANDATE_DEV_SCENARIOS=1` in `.env.development.local`, 404 otherwise) creates an active mandate, a passing and a blocked cart and a sample conversation for e2e.
- Pages: `/mandates/[code]` (chat), `/mandates/[code]/check/[cartId]` (check, Pay With Linked PayPal, Cancel Purchase). NavLink streams behind Suspense (Next 16 runtime data rule).

## US1 facts
- `lib/mandate/draft.ts`: Claude extracts raw fields (dollars, color phrase, expiry kind); `interpretDraft` converts by code (cents, ET 11:59 PM expiries via `lib/time/et.ts`, assumption notes). No model key -> 503 and the UI offers "Fill In the Terms Myself" (manual draft).
- `lib/mandate/service.ts` + `lib/api/mandates.ts` (handlers tested directly) + thin routes under `app/api/mandates/**` via `lib/api/http.ts`.
- Link: `lib/payments/vault.ts` (setup token tied to the mandate in `vault_setup_token_id`, payment token kept server side). Migration 0001 adds that column.
- UI: `components/mandate/MandateBuilder.tsx` (URL keeps `?code=`), `TermEditors.tsx`, `LinkPayPal.tsx` (v6 SDK, official button only).
- Local PGlite DB at `.data/pglite` creates itself and seeds the catalog on first open.

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
