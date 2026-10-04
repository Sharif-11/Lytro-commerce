ALTER TABLE "control"."sms_outbox" ALTER COLUMN "body" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."sms_outbox" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."sms_outbox" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."sms_outbox" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."sms_outbox" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "control"."sms_outbox" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_outbox_due_idx" ON "control"."sms_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
ALTER TABLE "control"."sms_outbox" ADD CONSTRAINT "sms_outbox_status_check" CHECK ("control"."sms_outbox"."status" in ('pending','sending','sent','failed'));--> statement-breakpoint
-- AUTH-05: one-time code text must never rest in the outbox. Clear any already recorded (development data).
UPDATE control.sms_outbox SET body = NULL WHERE kind = 'otp';
--> statement-breakpoint
-- The sender updates delivery status. Application role grants, as in earlier migrations.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT UPDATE ON control.sms_outbox TO lytronix_app;
  END IF;
END $$;
