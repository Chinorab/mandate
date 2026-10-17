CREATE TYPE "public"."assembled_by" AS ENUM('workflow', 'inline');--> statement-breakpoint
CREATE TYPE "public"."audit_actor" AS ENUM('buyer', 'agent', 'merchant', 'system');--> statement-breakpoint
CREATE TYPE "public"."cart_status" AS ENUM('open', 'checked_pass', 'checked_fail', 'checked_not_paid', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."check_stage" AS ENUM('preview', 'pre_create', 'pre_capture');--> statement-breakpoint
CREATE TYPE "public"."check_verdict" AS ENUM('pass', 'fail');--> statement-breakpoint
CREATE TYPE "public"."mandate_status" AS ENUM('draft', 'awaiting_link', 'active', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('created', 'captured', 'refunded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."shipping_status" AS ENUM('unfulfilled', 'shipped', 'delivered');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" uuid,
	"actor" "audit_actor" NOT NULL,
	"action" text NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "cart" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"mandate_id" uuid NOT NULL,
	"mandate_version_id" uuid NOT NULL,
	"store_id" text NOT NULL,
	"lines" jsonb NOT NULL,
	"status" "cart_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"mandate_version_id" uuid NOT NULL,
	"stage" "check_stage" NOT NULL,
	"verdict" "check_verdict" NOT NULL,
	"terms" jsonb NOT NULL,
	"totals" jsonb NOT NULL,
	"hash_verified" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"model_calls_day" date,
	"model_calls_today" integer DEFAULT 0 NOT NULL,
	"claimed_dispute_id" uuid
);
--> statement-breakpoint
CREATE TABLE "dispute" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paypal_dispute_id" text NOT NULL,
	"order_id" uuid,
	"reason" text,
	"status" text NOT NULL,
	"stage" text,
	"amount_cents" integer,
	"opened_at" timestamp with time zone,
	"seller_response_due" timestamp with time zone,
	"in_pool" boolean DEFAULT false NOT NULL,
	"claimed_by_session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispute_paypal_dispute_id_unique" UNIQUE("paypal_dispute_id")
);
--> statement-breakpoint
CREATE TABLE "evidence_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispute_id" uuid NOT NULL,
	"items" jsonb NOT NULL,
	"draft_text" text,
	"draft_sentences" jsonb,
	"edited_text" text,
	"accuracy_confirmed_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"paypal_response" jsonb,
	"assembled_by" "assembled_by" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_file_dispute_id_unique" UNIQUE("dispute_id")
);
--> statement-breakpoint
CREATE TABLE "mandate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"session_id" uuid NOT NULL,
	"instructions" text NOT NULL,
	"status" "mandate_status" DEFAULT 'draft' NOT NULL,
	"draft_terms" jsonb,
	"draft_assumptions" jsonb,
	"current_version_id" uuid,
	"vault_payment_token_id" text,
	"vault_customer_id" text,
	"revoked_at" timestamp with time zone,
	"flagged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mandate_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "mandate_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mandate_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"terms" jsonb NOT NULL,
	"assumptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"canonical" text NOT NULL,
	"sha256" char(64) NOT NULL,
	"signed_at" timestamp with time zone NOT NULL,
	"previous_version_id" uuid,
	"change_summary" jsonb,
	"amended_for_cart_id" uuid
);
--> statement-breakpoint
CREATE TABLE "model_usage_day" (
	"day" date PRIMARY KEY NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"session_id" uuid NOT NULL,
	"mandate_id" uuid NOT NULL,
	"mandate_version_id" uuid NOT NULL,
	"cart_id" uuid NOT NULL,
	"check_result_id" uuid NOT NULL,
	"store_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"paypal_order_id" text,
	"paypal_capture_id" text,
	"custom_id" text NOT NULL,
	"status" "order_status" DEFAULT 'created' NOT NULL,
	"shipping_status" "shipping_status" DEFAULT 'unfulfilled' NOT NULL,
	"tracking" jsonb,
	"buyer_masked" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"captured_at" timestamp with time zone,
	CONSTRAINT "orders_code_unique" UNIQUE("code"),
	CONSTRAINT "orders_paypal_order_id_unique" UNIQUE("paypal_order_id")
);
--> statement-breakpoint
CREATE TABLE "paypal_event" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"resource_id" text,
	"verified" boolean NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"attributes" jsonb NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"stock" integer NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"payee_merchant_id" text,
	"tax_rate_bp" integer NOT NULL,
	"shipping_cents" integer NOT NULL,
	"free_shipping_over_cents" integer
);
--> statement-breakpoint
ALTER TABLE "cart" ADD CONSTRAINT "cart_session_id_demo_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."demo_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart" ADD CONSTRAINT "cart_mandate_id_mandate_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."mandate"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart" ADD CONSTRAINT "cart_mandate_version_id_mandate_version_id_fk" FOREIGN KEY ("mandate_version_id") REFERENCES "public"."mandate_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart" ADD CONSTRAINT "cart_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_result" ADD CONSTRAINT "check_result_cart_id_cart_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."cart"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_result" ADD CONSTRAINT "check_result_mandate_version_id_mandate_version_id_fk" FOREIGN KEY ("mandate_version_id") REFERENCES "public"."mandate_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute" ADD CONSTRAINT "dispute_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute" ADD CONSTRAINT "dispute_claimed_by_session_id_demo_session_id_fk" FOREIGN KEY ("claimed_by_session_id") REFERENCES "public"."demo_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_file" ADD CONSTRAINT "evidence_file_dispute_id_dispute_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."dispute"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandate" ADD CONSTRAINT "mandate_session_id_demo_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."demo_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandate_version" ADD CONSTRAINT "mandate_version_mandate_id_mandate_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."mandate"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_session_id_demo_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."demo_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_mandate_id_mandate_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."mandate"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_mandate_version_id_mandate_version_id_fk" FOREIGN KEY ("mandate_version_id") REFERENCES "public"."mandate_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cart_id_cart_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."cart"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_check_result_id_check_result_id_fk" FOREIGN KEY ("check_result_id") REFERENCES "public"."check_result"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_store_id_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "cart_mandate_idx" ON "cart" USING btree ("mandate_id");--> statement-breakpoint
CREATE INDEX "check_cart_idx" ON "check_result" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX "mandate_session_idx" ON "mandate" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mandate_version_no_idx" ON "mandate_version" USING btree ("mandate_id","version_no");--> statement-breakpoint
CREATE INDEX "order_mandate_idx" ON "orders" USING btree ("mandate_id");--> statement-breakpoint
CREATE INDEX "order_store_idx" ON "orders" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "product_store_idx" ON "product" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "product_category_idx" ON "product" USING btree ("category");