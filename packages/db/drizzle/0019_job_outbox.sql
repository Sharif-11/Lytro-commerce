CREATE TABLE IF NOT EXISTS "control"."job_outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"queue_name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"singleton_key" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"job_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
-- The relay's claim query: pending rows, oldest first.
CREATE INDEX IF NOT EXISTS "job_outbox_status_id_idx" ON "control"."job_outbox" ("status", "id");
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE ON control.job_outbox TO lytronix_app;
    GRANT USAGE, SELECT ON SEQUENCE control.job_outbox_id_seq TO lytronix_app;
  END IF;
END $$;
