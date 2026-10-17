CREATE TABLE "agent_thread" (
	"mandate_id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"times" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_thread" ADD CONSTRAINT "agent_thread_mandate_id_mandate_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."mandate"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_thread" ADD CONSTRAINT "agent_thread_session_id_demo_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."demo_session"("id") ON DELETE no action ON UPDATE no action;