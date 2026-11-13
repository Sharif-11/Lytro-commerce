CREATE TABLE IF NOT EXISTS "control"."job_heartbeats" (
	"name" text PRIMARY KEY NOT NULL,
	"finished_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
-- OBS-02, DAT-27 (Phase 9 Slice 9.6): the worker records each scheduled job's finished pass, and the API's jobs check
-- reads them. The nightly backups write theirs as the database's owner (deploy/database/bin/lytro-nightly).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE ON control.job_heartbeats TO lytronix_app;
  END IF;
END $$;
