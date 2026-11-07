-- Phase 7 Slice 7.3a (read agreed 2026-11-07): email through Resend. The addresses Lytro stops emailing after a bounce
-- or a spam complaint (NTF-06), the ID Resend gives each email it accepts, and the language each person chose, which
-- their email is written in (I18N-01).
CREATE TABLE IF NOT EXISTS "control"."mail_suppressions" (
	"email" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_suppressions_reason_check" CHECK ("control"."mail_suppressions"."reason" in ('bounced','complained'))
);
--> statement-breakpoint
ALTER TABLE "control"."mail_outbox" DROP CONSTRAINT "mail_outbox_status_check";--> statement-breakpoint
ALTER TABLE "tenant"."users" ADD COLUMN "language" varchar(2);--> statement-breakpoint
ALTER TABLE "control"."mail_outbox" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "tenant"."users" ADD CONSTRAINT "users_language_check" CHECK ("tenant"."users"."language" IS NULL OR "tenant"."users"."language" IN ('bn', 'en'));--> statement-breakpoint
ALTER TABLE "control"."mail_outbox" ADD CONSTRAINT "mail_outbox_status_check" CHECK ("control"."mail_outbox"."status" in ('pending','sending','sent','failed','suppressed'));--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.mail_suppressions TO lytronix_app;
  END IF;
END $$;
