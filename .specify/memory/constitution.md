<!--
Sync Impact Report
Version change: template (unversioned) -> 1.0.0
Modified principles: none (initial ratification)
Added principles:
  I. Consent Gate (NON-NEGOTIABLE)
  II. Numbers by Code, Meaning by Model
  III. Humans Sign and Humans Submit
  IV. Sandbox Only, Secrets Server Side
  V. Evidence Over Claims
  VI. Test First on Money Paths
  VII. Design Fidelity and Content Discipline
Added sections: Platform and Delivery Constraints; Workflow and Quality Gates; Governance
Removed sections: none
Templates: plan, spec and tasks templates read this file at runtime; no template edits required
Deferred TODOs: hosting target (Render or Vercel) is decided in speckit-plan, not here
-->

# Mandate Constitution

Mandate lets a buyer sign a structured purchasing mandate for a shopping agent, enforces it before
any PayPal payment, and gives the merchant a dispute evidence file built from that signed record.
Built for the PayPal AI Hackathon (Devpost), submission deadline 2026-11-12 12:00 PT, judging
2026-12-01 to 2026-12-15.

## Core Principles

### I. Consent Gate (NON-NEGOTIABLE)

- Every code path that creates, authorizes, captures or otherwise moves money MUST pass through a
  single Mandate check function before the PayPal call is made. There is no second path.
- This applies equally to direct REST calls and to PayPal Agent Toolkit tools: money moving
  toolkit tools are wrapped, and the unwrapped tools are never registered with the agent.
- The check MUST verify, against the signed and hashed mandate: mandate status (active, not
  revoked, not expired), total amount and currency, category, required and forbidden attributes,
  merchant allowlist, and remaining purchase count.
- The server recomputes the cart total and the mandate hash itself. Values sent by the client or
  produced by the model are never trusted for the check.
- A failed check blocks the payment, names the violated term, and offers two exits only: amend the
  mandate (a new explicit signature, a new hash) or cancel.
- Revocation takes effect immediately, including for orders created but not yet captured.

Rationale: the product claim is that no payment can leave the mandate. That claim is only true if
the gate is structural, not conventional.

### II. Numbers by Code, Meaning by Model

- Every numeric, temporal or enumerable constraint (price, currency, quantity, purchase count,
  expiry, merchant, size, category) is checked by deterministic code.
- The model (Claude, `claude-sonnet-5-5`) MAY judge semantic fit only (for example "neutral
  colors"), MUST return structured output with a stated reason, and its verdict can only add a
  block, never lift one raised by code.
- Natural language parsing into a mandate draft is done by the model, but every assumption it
  makes is surfaced to the buyer as an explicit, editable term before signing.

Rationale: models are good at meaning and unreliable at arithmetic and rules. Disputes are decided
on numbers.

### III. Humans Sign and Humans Submit

- A mandate becomes active only after an explicit buyer signature action on the full term list.
  On signature the canonical JSON of the terms is hashed with SHA-256 and timestamped; the signed
  record is immutable. Amendments create a new version linked to the previous one.
- Payment approval uses the official PayPal JS SDK flow so the buyer approves in PayPal.
- Dispute evidence drafted by the merchant agent is a draft. Nothing is sent to the PayPal
  Disputes API until a merchant reviews it, may edit it, and confirms submission.
- Drafted dispute text MUST be factual and built only from stored records (mandate, hash,
  timestamps, check result, order, shipping). No invented facts, quotes or tracking numbers;
  missing data is stated as missing.

Rationale: delegated authority is only provable if a human act creates it, and evidence is only
credible if a human stands behind it.

### IV. Sandbox Only, Secrets Server Side

- PayPal is used in sandbox only. Live endpoints are never configured.
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, the webhook ID and database
  credentials live in environment variables, never in the repository, never in client bundles,
  never in logs. Only the PayPal client ID, which is public by design, may reach the browser for
  the JS SDK.
- Every webhook is verified (PayPal signature verification) before it is processed; unverified
  events are rejected and logged without side effects.
- A committed `.env.example` documents every variable with empty values. A secret scan runs before
  each push.

Rationale: a payments demo that leaks keys or trusts forged webhooks disproves its own thesis.

### V. Evidence Over Claims

- Every statistic, figure or factual claim in the product, README, DEVPOST.md, landing page or
  video carries a link to its source. No source, no claim.
- No fake reviews, testimonials, customer logos, user counts or results. The demo merchant and its
  products are clearly labeled fictional.
- What we learned from the sandbox is written from observed API behavior (scripts in `/scripts`),
  and steps that cannot be automated in sandbox are documented as exact manual procedures.

Rationale: the jury scores impact on credibility, and the product itself is about provable records.

### VI. Test First on Money Paths

- Tests for the Mandate check and for the consent gate are written before the code they cover.
- Dedicated bypass tests MUST prove that no registered agent tool, API route or server action can
  create or capture a PayPal order without a passing check, including with a revoked, expired,
  amended or tampered mandate (hash mismatch).
- Playwright (playwright-cli skill) covers every journey on desktop and mobile viewports before
  every deployment: create mandate, compliant purchase, blocked purchase, amendment, revocation,
  dispute, evidence submission.
- A failing money path test blocks merge and deployment.

Rationale: the gate is the product; untested, it is a promise.

### VII. Design Fidelity and Content Discipline

- The Claude Design canvas (mirrored in `/design`) is the source of truth for layout, tokens and
  copy. Design tokens are extracted first and used through variables, never retyped ad hoc.
- Banned: purple gradients, any decorative gradient, pill shaped buttons, emojis (icons instead),
  dash punctuation in visible copy (em dash, en dash, spaced hyphen), generic marketing copy, and
  any mention or tag of AI in product UI text and images.
- PayPal branding is never imitated. The only PayPal visual is the official button rendered by the
  JS SDK; a footer states non affiliation.
- All visible text, documentation, code, comments and commits are in English, concise.
- Accessibility: real controls, visible focus, 44px touch targets, WCAG AA contrast, every status
  conveyed by icon and label, not color alone. Layouts work at phone width.
- A privacy page and a favicon exist before any public deployment.

Rationale: the design criterion rewards a complete, coherent product, and AI tells cost credibility.

## Platform and Delivery Constraints

- Stack: Next.js (App Router) with TypeScript, a light database for mandates, orders and disputes,
  AG Grid for the merchant dashboard (custom cell renderers, grouping, export), PayPal Orders v2,
  JS SDK v6, Webhooks, Disputes API, PayPal Agent Toolkit (TypeScript), Anthropic API.
- The README states which operations go through the Agent Toolkit and which go through direct REST.
- Repository: public GitHub, MIT license visible in About.
- The hosted demo stays testable end to end until 2026-12-15, with a sandbox buyer account given in
  the testing instructions (never API secrets).
- AI usage is documented in README and DEVPOST.md as Devpost requires; principle VII bans AI tags in
  product UI, not technical documentation.
- Demo video under 2:45, no copyrighted music, no third party marks except the PayPal SDK button.

## Workflow and Quality Gates

- Order is fixed: speckit-constitution, speckit-specify, speckit-clarify, speckit-plan,
  speckit-tasks, speckit-analyze, speckit-implement.
- Sandbox scripts in `/scripts` (create and capture with custom_id, webhook receipt, test dispute,
  evidence submission) run and are documented before application code depends on those APIs.
- Front end work loads the design skills first (design-taste-frontend, web-design-guidelines,
  design-md-library, image-to-code) and is checked against principle VII.
- `PROGRESS.md` at the repository root records the current step so work resumes, never restarts.
- Gate before each deployment: unit and bypass tests green, Playwright desktop and mobile green,
  secret scan clean, privacy page and favicon present.

## Governance

- This constitution supersedes other practices in this repository. Specs, plans and tasks MUST
  cite the principles they touch, and speckit-analyze treats a violation as critical.
- Amendments are made through speckit-constitution with a Sync Impact Report and a version bump:
  MAJOR for removing or redefining a principle, MINOR for adding or materially expanding one, PATCH
  for wording.
- Any deliberate exception is written in the plan's Complexity Tracking table with its reason; an
  exception to principle I is never accepted.

**Version**: 1.0.0 | **Ratified**: 2026-10-17 | **Last Amended**: 2026-10-17
