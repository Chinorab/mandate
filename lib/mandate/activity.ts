/**
 * What happened under a mandate: carts with their latest check, orders, and every signed version.
 * Feeds the History page and the receipt.
 */
import { asc, desc, eq, inArray } from "drizzle-orm";
import type { TermResult } from "@/lib/check/run";
import type { Db } from "@/lib/db/client";
import { cart, checkResult, mandateVersion, order, product, store } from "@/lib/db/schema";
import type { Change } from "./amend";
import { findOwned } from "./service";
import { termsSentence } from "./summary";
import { termsSchema } from "./terms";

export type ActivityRow = {
  cartId: string;
  at: string;
  item: string;
  store: string;
  totalCents: number;
  passed: number;
  total: number;
  outcome: "paid" | "blocked" | "cancelled" | "checked" | "not_paid" | "open";
  orderCode: string | null;
};

export type VersionRow = { versionNo: number; signedAt: string; sha256: string; canonical: string; terms: string; changes: Change[] };

export type Activity = {
  code: string;
  instructions: string;
  status: string;
  activity: ActivityRow[];
  versions: VersionRow[];
  receipt: { terms: string; fingerprint: string; orders: string; issuedAt: string; session: string };
};

export async function loadActivity(db: Db, sessionId: string, code: string, now: Date): Promise<Activity> {
  const m = await findOwned(db, sessionId, code);
  const versions = await db.select().from(mandateVersion).where(eq(mandateVersion.mandateId, m.id)).orderBy(asc(mandateVersion.versionNo));
  const carts = await db.select().from(cart).where(eq(cart.mandateId, m.id)).orderBy(desc(cart.createdAt));
  const ids = carts.map((c) => c.id);
  const checks = ids.length ? await db.select().from(checkResult).where(inArray(checkResult.cartId, ids)).orderBy(desc(checkResult.createdAt)) : [];
  const orders = await db.select().from(order).where(eq(order.mandateId, m.id));
  const products = new Map((await db.select().from(product)).map((p) => [p.id, p]));
  const stores = new Map((await db.select().from(store)).map((s) => [s.id, s]));

  const activity: ActivityRow[] = carts.flatMap((c) => {
    const last = checks.find((k) => k.cartId === c.id);
    if (!last) return [];
    const terms = (last.terms as TermResult[]).filter((t) => t.group === "term");
    const o = orders.find((x) => x.cartId === c.id && x.status === "captured");
    const lines = c.lines as { productId: string; qty: number }[];
    const outcome: ActivityRow["outcome"] = o
      ? "paid"
      : c.status === "cancelled"
        ? last.verdict === "fail"
          ? "blocked"
          : "cancelled"
        : c.status === "checked_not_paid"
          ? "not_paid"
          : last.verdict === "fail"
            ? "blocked"
            : "checked";
    return [
      {
        cartId: c.id,
        at: (o?.capturedAt ?? last.createdAt).toISOString(),
        item: lines.map((l) => products.get(l.productId)?.name ?? l.productId).join(", "),
        store: stores.get(c.storeId)?.name ?? c.storeId,
        totalCents: (last.totals as { totalCents: number }).totalCents,
        passed: terms.filter((t) => t.pass).length,
        total: terms.length,
        outcome,
        orderCode: o?.code ?? null,
      },
    ];
  });

  const versionRows: VersionRow[] = versions.map((v) => ({
    versionNo: v.versionNo,
    signedAt: v.signedAt.toISOString(),
    sha256: v.sha256,
    canonical: v.canonical,
    terms: termsSentence(termsSchema.parse(v.terms)),
    changes: (v.changeSummary as Change[] | null) ?? [],
  }));
  const current = versionRows[versionRows.length - 1];
  const paid = activity.filter((a) => a.outcome === "paid").length;
  const blocked = activity.filter((a) => a.outcome === "blocked").length;

  return {
    code: m.code,
    instructions: m.instructions,
    status: m.status,
    activity,
    versions: versionRows,
    receipt: {
      terms: current?.terms ?? "Not signed yet",
      fingerprint: current?.sha256 ?? "",
      orders: `${paid} paid, ${blocked} blocked before payment`,
      issuedAt: now.toISOString(),
      session: `Demo session ${sessionId.slice(0, 8).toUpperCase()}`,
    },
  };
}
