/**
 * Revocation (FR-020, FR-014b). Takes the same mandate row lock as the consent gate, so a payment
 * and a revocation can never interleave. The saved PayPal token is removed from our database inside
 * the lock (the agent can no longer pay even if PayPal is unreachable), then deleted at PayPal.
 */
import { and, eq, inArray } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { lockMandate, type Db } from "@/lib/db/client";
import { cart, mandate } from "@/lib/db/schema";
import type { VaultClient } from "@/lib/payments/vault";
import { MandateError, findOwned, toView } from "./service";

export async function revokeMandate(db: Db, vault: VaultClient | null, sessionId: string, code: string, body: unknown, now: Date) {
  if (!body || typeof body !== "object" || (body as { confirm?: unknown }).confirm !== true) {
    throw new MandateError(400, "confirmation_required", "Confirm that you want to revoke this mandate.");
  }
  const owned = await findOwned(db, sessionId, code);

  const token = await db.transaction(async (tx) => {
    const m = await lockMandate(tx, owned.id);
    if (!m) throw new MandateError(404, "not_found", "No such mandate");
    if (m.status === "draft") throw new MandateError(409, "draft", "A draft is not signed. Discard it instead.");
    if (m.status === "revoked" || m.revokedAt) throw new MandateError(409, "already_revoked", "This mandate is already revoked.");

    await tx
      .update(mandate)
      .set({ status: "revoked", revokedAt: now, vaultPaymentTokenId: null, vaultSetupTokenId: null })
      .where(eq(mandate.id, m.id));
    const cancelled = await tx
      .update(cart)
      .set({ status: "cancelled", updatedAt: now })
      .where(and(eq(cart.mandateId, m.id), inArray(cart.status, ["open", "checked_pass", "checked_fail", "checked_not_paid"])))
      .returning({ id: cart.id });
    await audit(tx, {
      sessionId,
      actor: "buyer",
      action: "mandate_revoked",
      detail: { code: m.code, cancelledCarts: cancelled.length, unlinked: Boolean(m.vaultPaymentTokenId) },
    });
    return m.vaultPaymentTokenId;
  });

  if (token && vault) {
    try {
      await vault.deletePaymentToken(token);
    } catch {
      // The token is already unusable here; record that PayPal still has to forget it.
      await audit(db, { sessionId, actor: "system", action: "vault_delete_failed", detail: { code } });
    }
  }
  const [fresh] = await db.select().from(mandate).where(eq(mandate.id, owned.id));
  return toView(db, fresh, now);
}
