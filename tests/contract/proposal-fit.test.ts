/**
 * Proposal labels describe the moment the agent proposed (seen while filming the demo): after the
 * buyer pays for one pair, an earlier proposal must not turn into "Over budget with tax" or "No orders
 * left" just because the budget and the order count are now used.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as carts from "@/lib/api/carts";
import { enrich } from "@/lib/agents/display";
import { order } from "@/lib/db/schema";
import { loadMandateContext } from "@/lib/mandate/context";
import { testDb } from "../helpers/db";
import { CANVAS_TERMS, CHECK_TIME } from "../helpers/fixtures";
import { activeMandate, fakeJudge, fakeMoney, newCart } from "../helpers/scenario";

let handle: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});

describe("proposal fit labels", () => {
  it("keep the label they had when the agent proposed, after a later purchase", async () => {
    const m = await activeMandate(handle.db, { terms: CANVAS_TERMS });
    const proposedAt = new Date(CHECK_TIME.getTime() - 60_000).toISOString();
    const options = [{ kind: "options" as const, productIds: ["daily-miler-blk-wht", "cadence-2-beige"], size: "10", at: proposedAt }];

    const before = await enrich(handle.db, (await loadMandateContext(handle.db, m.sessionId, m.code))!, options, CHECK_TIME);
    const labelsBefore = before.flatMap((i) => (i.kind === "options" ? i.cards.map((c) => c.fit.label) : []));
    expect(labelsBefore).toEqual(["Fits mandate", "Fits mandate"]);

    const cartId = await newCart(handle.db, m, "daily-miler-blk-wht");
    const paid = await carts.pay({ db: handle.db, money: fakeMoney().client, judge: fakeJudge().judge, now: () => CHECK_TIME }, m.sessionId, cartId);
    expect(paid.status).toBe(200);

    const later = new Date(CHECK_TIME.getTime() + 60_000);
    const after = await enrich(handle.db, (await loadMandateContext(handle.db, m.sessionId, m.code))!, options, later);
    expect(after.flatMap((i) => (i.kind === "options" ? i.cards.map((c) => c.fit.label) : []))).toEqual(labelsBefore);

    // A proposal made after the purchase (the order is stamped with the real capture time) sees the used order.
    const [o] = await handle.db.select({ at: order.capturedAt }).from(order).where(eq(order.mandateId, m.mandateId));
    const afterCapture = new Date(o.at!.getTime() + 1000);
    const fresh = await enrich(handle.db, (await loadMandateContext(handle.db, m.sessionId, m.code))!, [{ ...options[0], at: afterCapture.toISOString() }], afterCapture);
    const freshFits = fresh.flatMap((i) => (i.kind === "options" ? i.cards.map((c) => c.fit) : []));
    expect(freshFits.map((f) => f.fits)).toEqual([false, false]);
    expect(freshFits.every((f) => f.failed.includes("purchases"))).toBe(true);
  });
});
