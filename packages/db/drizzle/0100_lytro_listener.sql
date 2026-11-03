ALTER TYPE "tenant"."payment_review_reason" ADD VALUE 'request_closed';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."lytro_listener_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"sender" varchar(30) NOT NULL,
	"method" text,
	"transaction_id" varchar(20),
	"amount" numeric(12, 2),
	"sender_number" varchar(11),
	"raw_text" text,
	"status" text NOT NULL,
	"ignored_reason" text,
	"review_reason" text,
	"plan_payment_id" uuid,
	"received_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "control"."listener_devices" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."listener_pairing_codes" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."plan_payments" ADD COLUMN "amount_sent" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "control"."plan_payments" ADD COLUMN "amount_arrived" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "control"."plan_payments" ADD COLUMN "review_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lytro_listener_messages_holder_key" ON "control"."lytro_listener_messages" USING btree ("transaction_id") WHERE "control"."lytro_listener_messages"."status" IN ('matched', 'unmatched', 'needs_review');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lytro_listener_messages_phone_key" ON "control"."lytro_listener_messages" USING btree ("device_id","transaction_id") WHERE "control"."lytro_listener_messages"."status" <> 'ignored';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lytro_listener_messages_device_idx" ON "control"."lytro_listener_messages" USING btree ("device_id","received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lytro_listener_messages_status_idx" ON "control"."lytro_listener_messages" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lytro_listener_messages_text_idx" ON "control"."lytro_listener_messages" USING btree ("received_at") WHERE "control"."lytro_listener_messages"."raw_text" IS NOT NULL;
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written grants (not expressible in Drizzle). Phase 5 Slice 5.6, read agreed 2026-11-03.
-- ---------------------------------------------------------------------------------------------

-- PAY-21: the application role keeps what Lytro's own phones forward, settles it and redacts it (LSN-17).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.lytro_listener_messages TO lytronix_app;
  END IF;
END $$;
