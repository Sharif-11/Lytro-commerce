CREATE TABLE IF NOT EXISTS "control"."leases" (
	"key" text PRIMARY KEY NOT NULL,
	"holder" text NOT NULL,
	"until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."limit_events" (
	"bucket" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."service_states" (
	"service" text PRIMARY KEY NOT NULL,
	"down_since" timestamp with time zone,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leases_until_idx" ON "control"."leases" USING btree ("until");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "limit_events_bucket_at_idx" ON "control"."limit_events" USING btree ("bucket","at");--> statement-breakpoint
-- RED-11, RED-05, D9-15 (Phase 9 Slice 9.4): the app counts exact limits, holds leases and records a shared service's
-- outage. A limit's old rows and a lapsed lease are deleted as they're checked.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, DELETE ON control.limit_events TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.leases TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE ON control.service_states TO lytronix_app;
  END IF;
END $$;
