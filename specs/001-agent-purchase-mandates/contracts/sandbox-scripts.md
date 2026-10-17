# Contract: sandbox scripts (`/scripts`, run before app code depends on each API)

TypeScript run with `tsx`, reading `.env.local`. Each script prints what it sent and what PayPal returned
(secrets and tokens redacted) and appends a dated entry to `scripts/LEARNINGS.md`, which feeds the README
section "What we learned from the sandbox".

| Script | Proves | Exit criteria |
|---|---|---|
| `01-auth-and-order.ts` | OAuth, create + capture with `custom_id`, `invoice_id`, `description`, `PayPal-Request-Id` replay | `custom_id` returned on GET order and on the capture; replay returns the same order |
| `02-vault-setup.ts` | setup token → local page with JS SDK v6 save session → payment token | payment token id + customer id stored locally (gitignored) |
| `03-vault-charge-payee.ts` | merchant initiated charge with `vault_id` + `stored_credential`, to each of the 3 payees | per payee: COMPLETED or exact error; decides R2 fallback |
| `04-webhook-listener.ts` | receive and verify real events through a tunnel | `verification_status: SUCCESS` for capture and vault events; tampered body fails |
| `05-dispute.ts` | list a manually opened dispute, `require-evidence` if needed, `provide-evidence` multipart with PDF + notes + tracking, show result | evidence accepted; exact manual dispute steps written to LEARNINGS.md |
| `06-toolkit.ts` | Agent Toolkit `get_order`, `list_disputes`, `get_dispute`, `create_shipment_tracking` in sandbox | each returns data for the objects above |
| `07-revoke.ts` | delete payment token, then attempt charge | charge refused |

Manual steps that cannot be automated (dispute opening as the buyer, buyer login in the vault popup) are
written as numbered click by click procedures in LEARNINGS.md.
