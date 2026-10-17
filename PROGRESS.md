# PROGRESS — Mandate (PayPal AI Hackathon)

Deadline: 2026-11-12 12:00 PT (Devpost `paypalaihackathon`). Demo must stay testable until 2026-12-15 08:00 PT.
Targets: Grand Prizes, Best Use of Agentic Commerce, AG Grid sponsor prize (Render prize if hosted on Render).

## Current step
Phase 1 (Setup, T001..T011) DONE 2026-10-17. Next: Phase 2, starting with the sandbox scripts T012..T020, which need the user's PayPal sandbox keys in `.env.local` (`docs/sandbox-setup.md`). T021+ (DB schema, session, pricing, canonical hash) can start without keys. Nothing committed yet.

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
