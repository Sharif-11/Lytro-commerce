CREATE TABLE IF NOT EXISTS "tenant"."courier_raw_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"courier_key" text NOT NULL,
	"body" text NOT NULL,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"outcome" text DEFAULT 'received' NOT NULL,
	"event_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."gateway_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"method" text NOT NULL,
	"action" text NOT NULL,
	"session_id" uuid,
	"payment_id" varchar(100) NOT NULL,
	"answer" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"transaction_status" varchar(40)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."reconciliation_differences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"tenant_id" uuid,
	"expected" numeric(14, 2),
	"found" numeric(14, 2),
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"note" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_differences_once" UNIQUE("day","kind","subject")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."reconciliation_runs" (
	"day" date PRIMARY KEY NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"found" integer DEFAULT 0 NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courier_raw_messages_tenant_received_idx" ON "tenant"."courier_raw_messages" USING btree ("tenant_id","received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courier_raw_messages_unread_idx" ON "tenant"."courier_raw_messages" USING btree ("tenant_id","received_at") WHERE "tenant"."courier_raw_messages"."outcome" <> 'read';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gateway_answers_received_idx" ON "control"."gateway_answers" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gateway_answers_session_idx" ON "control"."gateway_answers" USING btree ("session_id","received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gateway_answers_tenant_idx" ON "control"."gateway_answers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reconciliation_differences_state_idx" ON "control"."reconciliation_differences" USING btree ("state","day");--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------------------------
-- Hand-written below.
-- DAT-51, D9-16 (Phase 9 Slice 9.5): a shop's courier messages as they arrived are its own, as its courier news is.
-- ---------------------------------------------------------------------------------------------------------------
ALTER TABLE tenant.courier_raw_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.courier_raw_messages FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.courier_raw_messages USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
-- DAT-51, DAT-52: messages and answers are written once, marked read once, and removed past their days or with their
-- shop; a difference is found, then resolved; a run is recorded once a day.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.courier_raw_messages TO lytronix_app;
    GRANT SELECT, INSERT, DELETE ON control.gateway_answers TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE ON control.reconciliation_differences TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE ON control.reconciliation_runs TO lytronix_app;
  END IF;
END $$;
