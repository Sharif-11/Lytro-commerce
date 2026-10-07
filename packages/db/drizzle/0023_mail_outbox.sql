CREATE TABLE IF NOT EXISTS "control"."mail_outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"to_email" text NOT NULL,
	"kind" text NOT NULL,
	"subject" text,
	"body" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_outbox_status_check" CHECK ("control"."mail_outbox"."status" in ('pending','sending','sent','failed'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mail_outbox_created_idx" ON "control"."mail_outbox" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mail_outbox_due_idx" ON "control"."mail_outbox" USING btree ("status","next_attempt_at");
--> statement-breakpoint
-- Application role grants (see the note in 0001). Each new table needs its grants here.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE ON control.mail_outbox TO lytronix_app;
    GRANT USAGE, SELECT ON SEQUENCE control.mail_outbox_id_seq TO lytronix_app;
  END IF;
END $$;