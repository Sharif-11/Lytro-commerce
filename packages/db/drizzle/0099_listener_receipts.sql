CREATE TYPE "tenant"."listener_ignored_reason" AS ENUM('unknown_sender', 'unknown_format', 'not_receipt', 'not_money_in', 'too_old', 'too_new', 'test_mode');--> statement-breakpoint
CREATE TYPE "tenant"."listener_message_status" AS ENUM('matched', 'unmatched', 'needs_review', 'duplicate', 'ignored');--> statement-breakpoint
CREATE TYPE "tenant"."payment_review_reason" AS ENUM('amount', 'sender', 'wallet', 'old_receipt', 'low_balance', 'order_closed', 'transaction_id_used');--> statement-breakpoint
ALTER TYPE "tenant"."ledger_entry_type" ADD VALUE 'verification_fee' BEFORE 'carry_over';--> statement-breakpoint
ALTER TYPE "control"."listener_revoke_reason" ADD VALUE 'device';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."listener_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"sender" varchar(30) NOT NULL,
	"method" "tenant"."payment_method",
	"transaction_id" varchar(20),
	"amount" numeric(12, 2),
	"sender_number" varchar(11),
	"raw_text" text,
	"status" "tenant"."listener_message_status" NOT NULL,
	"ignored_reason" "tenant"."listener_ignored_reason",
	"review_reason" "tenant"."payment_review_reason",
	"session_id" uuid,
	"payment_id" uuid,
	"received_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."listener_unread_shapes" (
	"day" date NOT NULL,
	"shape_hash" char(64) NOT NULL,
	"shape" varchar(300) NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "listener_unread_shapes_pkey" PRIMARY KEY("day","shape_hash")
);
--> statement-breakpoint
ALTER TABLE "tenant"."payment_sessions" ADD COLUMN "review_reason" "tenant"."payment_review_reason";--> statement-breakpoint
ALTER TABLE "tenant"."payment_sessions" ADD COLUMN "id_changes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant"."payment_sessions" ADD COLUMN "staff_told_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "control"."listener_devices" ADD COLUMN "test_mode_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "control"."listener_devices" ADD COLUMN "uploads_day" date;--> statement-breakpoint
ALTER TABLE "control"."listener_devices" ADD COLUMN "uploads_today" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."listener_devices" ADD COLUMN "volume_flagged_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "listener_messages_holder_key" ON "tenant"."listener_messages" USING btree ("tenant_id","transaction_id") WHERE "tenant"."listener_messages"."status" IN ('matched', 'unmatched', 'needs_review');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "listener_messages_phone_key" ON "tenant"."listener_messages" USING btree ("tenant_id","device_id","transaction_id") WHERE "tenant"."listener_messages"."status" <> 'ignored';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listener_messages_device_idx" ON "tenant"."listener_messages" USING btree ("tenant_id","device_id","received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listener_messages_status_idx" ON "tenant"."listener_messages" USING btree ("tenant_id","status","received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listener_messages_session_idx" ON "tenant"."listener_messages" USING btree ("tenant_id","session_id") WHERE "tenant"."listener_messages"."session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listener_messages_payment_idx" ON "tenant"."listener_messages" USING btree ("tenant_id","payment_id") WHERE "tenant"."listener_messages"."payment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listener_messages_text_idx" ON "tenant"."listener_messages" USING btree ("tenant_id","received_at") WHERE "tenant"."listener_messages"."raw_text" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_sessions_transaction_idx" ON "tenant"."payment_sessions" USING btree ("tenant_id","transaction_id") WHERE "tenant"."payment_sessions"."transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_sessions_untold_idx" ON "tenant"."payment_sessions" USING btree ("tenant_id","submitted_at") WHERE "tenant"."payment_sessions"."state" = 'checking' AND "tenant"."payment_sessions"."staff_told_at" IS NULL;
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written isolation, grants and data (not expressible in Drizzle). Phase 5 Slice 5.4b, read agreed 2026-11-02.
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses (VER-05).
ALTER TABLE tenant.listener_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.listener_messages FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.listener_messages USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
-- The application role keeps what phones forward, settles it, redacts it (LSN-17) and deletes it at day 60 (LSN-23); the
-- unreadable messages' shapes name no shop and go after [90] days.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.listener_messages TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.listener_unread_shapes TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- RAT-16: the listener's verification fee starts at [0.10]% of the payment (WAL-20).
INSERT INTO control.rates (key, value) VALUES ('listener_verification_pct', 0.10)
ON CONFLICT (key) DO NOTHING;
