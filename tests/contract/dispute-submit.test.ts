/**
 * Dispute review and submission (FR-030, FR-031, FR-032, US6 scenarios 3 and 4): one session claims
 * one pool dispute; only it can edit or submit; nothing reaches PayPal before the accuracy statement
 * is confirmed; a PayPal rejection keeps the draft.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as api from "@/lib/api/disputes";
import { auditLog, dispute, evidenceFile, order } from "@/lib/db/schema";
import { templateDrafter } from "@/lib/disputes/draft";
import type { DisputeView } from "@/lib/disputes/view";
import { handlePayPalWebhook } from "@/lib/webhooks/dispatch";
import { testDb } from "../helpers/db";
import { SIGNED_HEADERS, disputeEvent, fakeDisputes, fakeVerify, paidOrder } from "../helpers/disputes";
import { newSession } from "../helpers/scenario";

let handle: Awaited<ReturnType<typeof testDb>>;
beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});
beforeEach(async () => {
  // Each test starts with an empty pool.
  await handle.db.update(dispute).set({ inPool: false });
});

/** A pool dispute on a fresh paid order, assembled through the webhook path. */
async function poolDispute(opts: { tracking?: boolean } = {}) {
  const { orderCode, m } = await paidOrder(handle.db);
  if (opts.tracking) {
    await handle.db.update(order).set({ shippingStatus: "shipped", tracking: { carrier: "UPS", number: "1Z999AA10123456784" } }).where(eq(order.code, orderCode));
  }
  const [o] = await handle.db.select().from(order).where(eq(order.code, orderCode));
  const event = disputeEvent({ captureId: o.paypalCaptureId });
  await handlePayPalWebhook({ db: handle.db, verify: fakeVerify, drafter: templateDrafter, enqueue: (job) => job.run() }, SIGNED_HEADERS, JSON.stringify(event));
  const [ds] = await handle.db.select().from(dispute).where(eq(dispute.paypalDisputeId, event.resource.dispute_id));
  return { id: ds.id, paypalId: event.resource.dispute_id, orderCode, mandateCode: m.code };
}

async function claimed(opts: { tracking?: boolean } = {}) {
  const d = await poolDispute(opts);
  const sessionId = await newSession(handle.db);
  const c = await api.claim(handle.db, sessionId);
  expect(c.body).toMatchObject({ disputeId: d.id, readOnly: false });
  return { ...d, sessionId };
}

const view = (r: { body: unknown }) => r.body as DisputeView & { evidence: NonNullable<DisputeView["evidence"]> };

describe("pool claim", () => {
  it("gives each session its own dispute, and the same one on return", async () => {
    const a = await poolDispute();
    const b = await poolDispute();
    const [s1, s2] = [await newSession(handle.db), await newSession(handle.db)];
    const [c1, c2] = await Promise.all([api.claim(handle.db, s1), api.claim(handle.db, s2)]);
    const ids = [(c1.body as { disputeId: string }).disputeId, (c2.body as { disputeId: string }).disputeId];
    expect(new Set(ids)).toEqual(new Set([a.id, b.id]));
    expect((await api.claim(handle.db, s1)).body).toMatchObject({ disputeId: ids[0], readOnly: false });
  });

  it("shows a submitted dispute read only when the pool is empty", async () => {
    const d = await claimed();
    const ok = await api.submit({ db: handle.db, disputes: fakeDisputes().client }, d.sessionId, d.id, { accuracyConfirmed: true });
    expect(ok.status).toBe(200);
    const late = await newSession(handle.db);
    const c = await api.claim(handle.db, late);
    expect(c.body).toMatchObject({ disputeId: d.id, readOnly: true, poolEmpty: true });
    const v = view(await api.getDispute(handle.db, late, d.id));
    expect(v.canEdit).toBe(false);
    expect(v.claimedByYou).toBe(false);
  });

  it("says so when there is nothing at all to show", async () => {
    await handle.db.delete(evidenceFile);
    await handle.db.delete(dispute);
    expect((await api.claim(handle.db, await newSession(handle.db))).body).toEqual({ disputeId: null, readOnly: true, poolEmpty: true });
  });
});

describe("GET /api/merchant/disputes/:id", () => {
  it("returns the dispute, a timeline from stored records, and the evidence file, without buyer identity", async () => {
    const d = await claimed({ tracking: true });
    const r = await api.getDispute(handle.db, d.sessionId, d.id);
    expect(r.status).toBe(200);
    const v = view(r);
    expect(v).toMatchObject({ paypalDisputeId: d.paypalId, reasonLabel: "Unauthorized transaction", amountCents: 10392, canEdit: true, claimedByYou: true });
    expect(v.order?.code).toBe(d.orderCode);
    expect(v.timeline.map((t) => t.title)).toEqual(["Mandate signed", "Mandate check passed", "Payment captured", "Shipped", "Dispute opened", "Your response"]);
    expect(v.evidence.items.map((i) => i.key)).toEqual(["mandate", "check", "transaction", "shipment"]);
    expect(v.evidence.response).toContain(d.mandateCode);
    expect(JSON.stringify(v)).not.toContain(d.sessionId);
  });

  it("shows an unclaimed pool dispute as free to claim, not as someone else's", async () => {
    const d = await poolDispute();
    const v = view(await api.getDispute(handle.db, await newSession(handle.db), d.id));
    expect(v.readOnlyReason).toBe("unclaimed");
    expect(v.canEdit).toBe(false);
  });

  it("404s on an unknown id", async () => {
    expect((await api.getDispute(handle.db, await newSession(handle.db), crypto.randomUUID())).status).toBe(404);
    expect((await api.getDispute(handle.db, await newSession(handle.db), "not-a-uuid")).status).toBe(404);
  });
});

describe("PATCH /api/merchant/disputes/:id/evidence", () => {
  it("saves include toggles and the edited response for the claimant", async () => {
    const d = await claimed();
    const r = await api.saveEvidence(handle.db, d.sessionId, d.id, { included: { mandate: false }, editedText: null });
    expect(r.status).toBe(200);
    expect(view(r).evidence.response).not.toContain(d.mandateCode);
    const e = await api.saveEvidence(handle.db, d.sessionId, d.id, { included: { mandate: true }, editedText: "My own words about order " + d.orderCode + "." });
    expect(view(e).evidence.response).toBe(`My own words about order ${d.orderCode}.`);
    expect(view(e).evidence.edited).toBe(true);
  });

  it("refuses another session (403), unknown items and an over long response (400)", async () => {
    const d = await claimed();
    expect((await api.saveEvidence(handle.db, await newSession(handle.db), d.id, { included: {}, editedText: "x" })).status).toBe(403);
    expect((await api.saveEvidence(handle.db, d.sessionId, d.id, { included: { email: true }, editedText: null })).status).toBe(400);
    expect((await api.saveEvidence(handle.db, d.sessionId, d.id, { included: {}, editedText: "a".repeat(2001) })).status).toBe(400);
  });
});

describe("POST /api/merchant/disputes/:id/submit", () => {
  it("refuses a session that did not claim the dispute (403), with no PayPal call", async () => {
    const d = await claimed();
    const pp = fakeDisputes();
    const r = await api.submit({ db: handle.db, disputes: pp.client }, await newSession(handle.db), d.id, { accuracyConfirmed: true });
    expect(r.status).toBe(403);
    expect(pp.submissions).toHaveLength(0);
  });

  it("refuses without the accuracy confirmation (400), with no PayPal call", async () => {
    const d = await claimed();
    const pp = fakeDisputes();
    for (const body of [{}, { accuracyConfirmed: false }, { accuracyConfirmed: "true" }]) {
      const r = await api.submit({ db: handle.db, disputes: pp.client }, d.sessionId, d.id, body);
      expect(r.status).toBe(400);
      expect(r.body).toMatchObject({ error: { code: "accuracy_not_confirmed" } });
    }
    expect(pp.submissions).toHaveLength(0);
  });

  it("refuses when every item is excluded (400)", async () => {
    const d = await claimed();
    await api.saveEvidence(handle.db, d.sessionId, d.id, { included: { mandate: false, check: false, transaction: false }, editedText: null });
    const pp = fakeDisputes();
    const r = await api.submit({ db: handle.db, disputes: pp.client }, d.sessionId, d.id, { accuracyConfirmed: true });
    expect(r.status).toBe(400);
    expect(pp.submissions).toHaveLength(0);
  });

  it("sends the evidence report, tracking and the response, then records the time and PayPal's answer", async () => {
    const d = await claimed({ tracking: true });
    const pp = fakeDisputes();
    const r = await api.submit({ db: handle.db, disputes: pp.client, now: () => new Date("2026-11-04T14:00:00Z") }, d.sessionId, d.id, { accuracyConfirmed: true });
    expect(r.status).toBe(200);
    expect(view(r).evidence.submittedAt).toBe("2026-11-04T14:00:00.000Z");
    expect(view(r).canEdit).toBe(false);

    expect(pp.submissions).toHaveLength(1);
    const { disputeId, submission } = pp.submissions[0];
    expect(disputeId).toBe(d.paypalId);
    expect(submission.evidences.map((e) => e.evidence_type)).toEqual(["BILLING_AGREEMENT", "PROOF_OF_FULFILLMENT"]);
    expect(submission.evidences[0].notes).toContain(d.mandateCode);
    expect(submission.evidences[0].notes!.length).toBeLessThanOrEqual(2000);
    expect(submission.evidences[1].evidence_info).toEqual({ tracking_info: [{ carrier_name: "UPS", tracking_number: "1Z999AA10123456784" }] });
    expect(submission.files).toHaveLength(1);
    expect(submission.files[0].name).toMatch(/\.pdf$/);
    expect(new TextDecoder().decode(submission.files[0].bytes.slice(0, 5))).toBe("%PDF-");

    const [f] = await handle.db.select().from(evidenceFile).where(eq(evidenceFile.disputeId, d.id));
    expect(f.accuracyConfirmedAt).not.toBeNull();
    expect(f.paypalResponse).toMatchObject({ ok: true, status: "UNDER_REVIEW" });
    const audit = await handle.db.select().from(auditLog).where(eq(auditLog.action, "evidence_submitted"));
    expect(audit.some((a) => (a.detail as { disputeId?: string }).disputeId === d.id)).toBe(true);

    // Submitted once: a second submit is refused.
    const again = await api.submit({ db: handle.db, disputes: pp.client }, d.sessionId, d.id, { accuracyConfirmed: true });
    expect(again.status).toBe(409);
    expect(pp.submissions).toHaveLength(1);
  });

  it("leaves the tracking out when the shipment item is excluded", async () => {
    const d = await claimed({ tracking: true });
    await api.saveEvidence(handle.db, d.sessionId, d.id, { included: { shipment: false }, editedText: null });
    const pp = fakeDisputes();
    await api.submit({ db: handle.db, disputes: pp.client }, d.sessionId, d.id, { accuracyConfirmed: true });
    expect(pp.submissions[0].submission.evidences.map((e) => e.evidence_type)).toEqual(["BILLING_AGREEMENT"]);
    expect(pp.submissions[0].submission.evidences[0].notes).not.toContain("1Z999AA10123456784");
  });

  it("keeps the draft and shows PayPal's reason when PayPal rejects", async () => {
    const d = await claimed();
    await api.saveEvidence(handle.db, d.sessionId, d.id, { included: {}, editedText: "Edited before a rejection." });
    const r = await api.submit({ db: handle.db, disputes: fakeDisputes("reject").client }, d.sessionId, d.id, { accuracyConfirmed: true });
    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({ error: { code: "paypal_rejected", message: expect.stringContaining("The evidence file is not valid.") } });
    const v = view(await api.getDispute(handle.db, d.sessionId, d.id));
    expect(v.evidence.submittedAt).toBeNull();
    expect(v.evidence.response).toBe("Edited before a rejection.");
    expect(v.evidence.lastError).toContain("The evidence file is not valid.");
    expect(v.canEdit).toBe(true);
  });

  it("keeps the draft when PayPal is not configured (503)", async () => {
    const d = await claimed();
    const r = await api.submit({ db: handle.db, disputes: null }, d.sessionId, d.id, { accuracyConfirmed: true });
    expect(r.status).toBe(503);
    expect(view(await api.getDispute(handle.db, d.sessionId, d.id)).evidence.submittedAt).toBeNull();
  });

  it("submits once when two submits race", async () => {
    const d = await claimed();
    const pp = fakeDisputes();
    const deps = { db: handle.db, disputes: pp.client };
    const results = await Promise.all([api.submit(deps, d.sessionId, d.id, { accuracyConfirmed: true }), api.submit(deps, d.sessionId, d.id, { accuracyConfirmed: true })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(pp.submissions).toHaveLength(1);
  });
});
