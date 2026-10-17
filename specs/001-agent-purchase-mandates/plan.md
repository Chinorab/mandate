# Implementation Plan: Agent Purchase Mandates

**Branch**: `001-agent-purchase-mandates` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-agent-purchase-mandates/spec.md`

## Summary

A Next.js app on Render where a buyer turns plain words into a signed, SHA-256 fingerprinted mandate, links
PayPal once (Vault v3 through JS SDK v6), and lets a Claude shopping agent buy from three fictional stores.
Every payment goes through one deterministic consent gate (`runMandateCheck` + `payCart`) before a merchant
initiated Orders v2 charge that carries the mandate in `custom_id`. Blocked carts offer amend (new version,
new hash) or cancel. The merchant sees agent orders in AG Grid Enterprise and an AG Studio insights tab;
verified dispute webhooks start a Render Workflow that assembles an evidence file and a factual Claude
draft, which the merchant reviews and submits through the Disputes API. Research: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 20.9+

**Primary Dependencies**: Next.js 16 (App Router), React 19, Vercel AI SDK + `@ai-sdk/anthropic`
(`claude-sonnet-5-5`), `@paypal/agent-toolkit`, PayPal JS SDK v6 (web-sdk/v6/core), AG Grid Enterprise +
AG Studio (React), Drizzle ORM, zod, pdf-lib, `@renderinc/sdk` (Workflows)

**Storage**: PostgreSQL 16 (Render Postgres Basic)

**Testing**: Vitest (unit, contract, bypass), Playwright via playwright-cli skill (journeys, desktop + mobile)

**Target Platform**: Render web service (Linux, Node) + Render Workflows; modern browsers, phone and desktop

**Project Type**: web application (single Next.js project, server routes + React UI)

**Performance Goals**: draft mandate under 10 s, check under 1 s excluding the semantic call, evidence file
within 1 min of the webhook

**Constraints**: sandbox only; no secret or vault token in the browser; model cap 40 calls per session per day;
demo up until 2026-12-15; AG Studio trial is 45 days (activate on or after 2026-11-01)

**Scale/Scope**: judges and visitors, tens of concurrent sessions; 9 pages; about 30 catalog products

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How the plan complies | Status |
|---|---|---|
| I. Consent Gate | single `lib/payments/gate.ts`; toolkit money tools never registered raw; locks + re-check before create and capture; revocation deletes the vault token | Pass |
| II. Numbers by Code | `runMandateCheck` pure and deterministic; model only fills `semantic` verdicts, which can only fail; template explanations | Pass |
| III. Humans Sign and Submit | sign + PayPal link are explicit acts; versions immutable; submit requires claimant + accuracy confirmation; draft sentences mapped to evidence items | Pass |
| IV. Sandbox, Secrets | sandbox base URLs hardcoded by env guard; env only; webhook signature verified; `.env.example`; secret scan in gate | Pass |
| V. Evidence Over Claims | sources linked on landing, README, DEVPOST; stores labeled fictional; LEARNINGS.md from real runs | Pass |
| VI. Test First on Money Paths | bypass suite written before `gate.ts`; Playwright desktop + mobile before every deploy | Pass |
| VII. Design Fidelity | tokens extracted from `design/project/System.dc.html` first; AG Grid themed with the same tokens; content rules checked in review | Pass |

Post design re-check (after Phase 1): still Pass. Two deliberate deviations from the canvas are spec driven,
not violations: the PayPal button moves from the check screen to signing (agent pays alone), and budget copy
reads "total for this mandate".

## Project Structure

### Documentation (this feature)

```text
specs/001-agent-purchase-mandates/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── consent-gate.md
│   ├── http-api.md
│   └── sandbox-scripts.md
└── tasks.md            (speckit-tasks)
```

### Source Code (repository root)

```text
app/
├── (public)/page.tsx, privacy/page.tsx
├── (buyer)/mandates/new, mandates/[code], mandates/[code]/check/[cartId], history
├── (merchant)/merchant, merchant/insights, merchant/disputes/[id]
├── api/ (routes per contracts/http-api.md)
├── icon.svg, apple-icon.png, favicon.ico
└── layout.tsx, globals.css (tokens)
components/
├── ui/ (Button, Tag, TermRow, Money, Icon set)
├── mandate/, agent/, check/, merchant/grid/, merchant/studio/, dispute/
lib/
├── mandate/ (terms schema, canonicalize, hash, draft via model)
├── check/ (runMandateCheck, explanations, semantic)
├── pricing/ (computeTotals)
├── payments/ (gate.ts, paypal-rest.ts, vault.ts, toolkit.ts)   <- only place money moves
├── agents/ (shopping agent, merchant agent, tool registry)
├── disputes/ (assemble evidence, draft, submit, pdf report)
├── webhooks/ (verify, route events)
├── session/, ratelimit/, db/ (drizzle schema, migrations, seed)
workflows/ (Render Workflows task: assembleEvidence)
scripts/ (01..07 sandbox scripts, LEARNINGS.md)
tests/
├── unit/, contract/, bypass/
└── e2e/ (Playwright: desktop + mobile projects)
design/project/ (canvas mirror, source of truth)
docs/ (sandbox-setup.md, dispute-pool-runbook.md)
render.yaml, .env.example, LICENSE (MIT), README.md, DEVPOST.md, VIDEO_SCRIPT.md
```

**Structure Decision**: one Next.js project at the repository root; the money path is isolated in
`lib/payments/` so bypass tests can scan and enforce the boundary.

## Phases and order

0. Sandbox scripts 01 to 07 with LEARNINGS.md (gate for R1, R2, R5 decisions). Fallbacks decided here.
1. Foundations: Next scaffold, tokens, DB schema, seed catalog, session cookie, favicon, privacy page.
2. Money core, test first: canonicalize + hash, pricing, `runMandateCheck`, bypass suite, then `gate.ts`.
3. Buyer journeys: draft, sign, vault link, agent chat, check screen, blocked + amend, revoke, history, receipt.
4. Merchant: orders grid (AG Grid Enterprise), tracking, webhooks, Workflow evidence task, dispute page,
   submit; AG Studio insights with custom widgets and Studio agent.
5. Landing, README, DEVPOST.md, video script; Playwright desktop + mobile; deploy to Render; dispute pool
   runbook; activate AG Studio trial on or after 2026-11-01.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Vault charge refused for other payees | 3 store model | script 03 first; fallback: one merchant account, storefront allowlist |
| Vault unavailable in sandbox app | agent autonomy | fallback flag: SDK button approval per payment (spec clarification) |
| Dispute reasons limited for wallet funded orders | dispute story | script 05 tries reasons; fund sandbox buyer with card if needed |
| AG Studio trial expiry before Dec 15 | sponsor prize, watermark | activate on or after Nov 1; grid still works unlicensed |
| Render Workflows beta changes | evidence job | same function runs inline as fallback |
| Model cost from public traffic | budget | session + global caps, spend limit on key |

## Complexity Tracking

No constitution violations to justify.
