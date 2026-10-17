/**
 * Database schema, mirrors specs/001-agent-purchase-mandates/data-model.md.
 * Money is integer cents, times are timestamptz (UTC). Vault tokens live only here and are never
 * serialized to the browser.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();

export const mandateStatus = pgEnum("mandate_status", [
  "draft",
  "awaiting_link",
  "active",
  "expired",
  "revoked",
]);
export const cartStatus = pgEnum("cart_status", [
  "open",
  "checked_pass",
  "checked_fail",
  "checked_not_paid",
  "paid",
  "cancelled",
]);
export const checkStage = pgEnum("check_stage", ["preview", "pre_create", "pre_capture"]);
export const checkVerdict = pgEnum("check_verdict", ["pass", "fail"]);
export const orderStatus = pgEnum("order_status", ["created", "captured", "refunded", "failed"]);
export const shippingStatus = pgEnum("shipping_status", ["unfulfilled", "shipped", "delivered"]);
export const assembledBy = pgEnum("assembled_by", ["workflow", "inline"]);
export const auditActor = pgEnum("audit_actor", ["buyer", "agent", "merchant", "system"]);

export const demoSession = pgTable("demo_session", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: createdAt(),
  lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  modelCallsDay: date("model_calls_day", { mode: "string" }),
  modelCallsToday: integer("model_calls_today").notNull().default(0),
  // Plain uuid, no FK: dispute references sessions too and the pool claim is advisory.
  claimedDisputeId: uuid("claimed_dispute_id"),
});

export const mandate = pgTable(
  "mandate",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => demoSession.id),
    instructions: text("instructions").notNull(),
    status: mandateStatus("status").notNull().default("draft"),
    // Editable only while status is draft; frozen into mandate_version on signature.
    draftTerms: jsonb("draft_terms"),
    draftAssumptions: jsonb("draft_assumptions"),
    currentVersionId: uuid("current_version_id"),
    vaultPaymentTokenId: text("vault_payment_token_id"),
    vaultCustomerId: text("vault_customer_id"),
    revokedAt: ts("revoked_at"),
    flaggedAt: ts("flagged_at"),
    createdAt: createdAt(),
  },
  (t) => [index("mandate_session_idx").on(t.sessionId)],
);

export const mandateVersion = pgTable(
  "mandate_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mandateId: uuid("mandate_id")
      .notNull()
      .references(() => mandate.id),
    versionNo: integer("version_no").notNull(),
    terms: jsonb("terms").notNull(),
    assumptions: jsonb("assumptions").notNull().default(sql`'[]'::jsonb`),
    canonical: text("canonical").notNull(),
    sha256: char("sha256", { length: 64 }).notNull(),
    signedAt: ts("signed_at").notNull(),
    previousVersionId: uuid("previous_version_id"),
    changeSummary: jsonb("change_summary"),
    amendedForCartId: uuid("amended_for_cart_id"),
  },
  (t) => [uniqueIndex("mandate_version_no_idx").on(t.mandateId, t.versionNo)],
);

export const store = pgTable("store", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // Sandbox business account receiving payments for this store (from env at seed time).
  payeeMerchantId: text("payee_merchant_id"),
  taxRateBp: integer("tax_rate_bp").notNull(),
  shippingCents: integer("shipping_cents").notNull(),
  freeShippingOverCents: integer("free_shipping_over_cents"),
});

export const product = pgTable(
  "product",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id")
      .notNull()
      .references(() => store.id),
    name: text("name").notNull(),
    category: text("category").notNull(),
    attributes: jsonb("attributes").notNull(),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    stock: integer("stock").notNull(),
    description: text("description").notNull(),
  },
  (t) => [index("product_store_idx").on(t.storeId), index("product_category_idx").on(t.category)],
);

export const cart = pgTable(
  "cart",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => demoSession.id),
    mandateId: uuid("mandate_id")
      .notNull()
      .references(() => mandate.id),
    mandateVersionId: uuid("mandate_version_id")
      .notNull()
      .references(() => mandateVersion.id),
    storeId: text("store_id")
      .notNull()
      .references(() => store.id),
    // Ids and choices only. Prices are never stored from input.
    lines: jsonb("lines").notNull(),
    status: cartStatus("status").notNull().default("open"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("cart_mandate_idx").on(t.mandateId)],
);

export const checkResult = pgTable(
  "check_result",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => cart.id),
    mandateVersionId: uuid("mandate_version_id")
      .notNull()
      .references(() => mandateVersion.id),
    stage: checkStage("stage").notNull(),
    verdict: checkVerdict("verdict").notNull(),
    terms: jsonb("terms").notNull(),
    totals: jsonb("totals").notNull(),
    hashVerified: boolean("hash_verified").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("check_cart_idx").on(t.cartId)],
);

export const order = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => demoSession.id),
    mandateId: uuid("mandate_id")
      .notNull()
      .references(() => mandate.id),
    mandateVersionId: uuid("mandate_version_id")
      .notNull()
      .references(() => mandateVersion.id),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => cart.id),
    checkResultId: uuid("check_result_id")
      .notNull()
      .references(() => checkResult.id),
    storeId: text("store_id")
      .notNull()
      .references(() => store.id),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    paypalOrderId: text("paypal_order_id").unique(),
    paypalCaptureId: text("paypal_capture_id"),
    customId: text("custom_id").notNull(),
    status: orderStatus("status").notNull().default("created"),
    shippingStatus: shippingStatus("shipping_status").notNull().default("unfulfilled"),
    tracking: jsonb("tracking"),
    buyerMasked: text("buyer_masked"),
    createdAt: createdAt(),
    capturedAt: ts("captured_at"),
  },
  (t) => [index("order_mandate_idx").on(t.mandateId), index("order_store_idx").on(t.storeId)],
);

export const dispute = pgTable("dispute", {
  id: uuid("id").primaryKey().defaultRandom(),
  paypalDisputeId: text("paypal_dispute_id").notNull().unique(),
  orderId: uuid("order_id").references(() => order.id),
  reason: text("reason"),
  status: text("status").notNull(),
  stage: text("stage"),
  amountCents: integer("amount_cents"),
  openedAt: ts("opened_at"),
  sellerResponseDue: ts("seller_response_due"),
  inPool: boolean("in_pool").notNull().default(false),
  claimedBySessionId: uuid("claimed_by_session_id").references(() => demoSession.id),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const evidenceFile = pgTable("evidence_file", {
  id: uuid("id").primaryKey().defaultRandom(),
  disputeId: uuid("dispute_id")
    .notNull()
    .unique()
    .references(() => dispute.id),
  items: jsonb("items").notNull(),
  draftText: text("draft_text"),
  // Each drafted sentence with the evidence item keys it rests on (grounding check).
  draftSentences: jsonb("draft_sentences"),
  editedText: text("edited_text"),
  accuracyConfirmedAt: ts("accuracy_confirmed_at"),
  submittedAt: ts("submitted_at"),
  paypalResponse: jsonb("paypal_response"),
  assembledBy: assembledBy("assembled_by").notNull(),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const paypalEvent = pgTable("paypal_event", {
  // PayPal event id: the primary key makes processing idempotent.
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  resourceId: text("resource_id"),
  verified: boolean("verified").notNull(),
  receivedAt: ts("received_at").notNull().defaultNow(),
  processedAt: ts("processed_at"),
  error: text("error"),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    at: ts("at").notNull().defaultNow(),
    sessionId: uuid("session_id"),
    actor: auditActor("actor").notNull(),
    action: text("action").notNull(),
    detail: jsonb("detail"),
  },
  (t) => [index("audit_at_idx").on(t.at)],
);

export const modelUsageDay = pgTable("model_usage_day", {
  day: date("day", { mode: "string" }).primaryKey(),
  calls: integer("calls").notNull().default(0),
});
