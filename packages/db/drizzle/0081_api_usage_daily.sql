CREATE TABLE IF NOT EXISTS "control"."api_usage_daily" (
	"tenant_id" uuid NOT NULL,
	"cycle_start" timestamp with time zone NOT NULL,
	"day" date NOT NULL,
	"requests" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "api_usage_daily_pkey" PRIMARY KEY("tenant_id","cycle_start","day"),
	CONSTRAINT "api_usage_daily_requests_check" CHECK ("control"."api_usage_daily"."requests" >= 0)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."api_usage_daily" ADD CONSTRAINT "api_usage_daily_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written: grants. Phase 3 Slice 11.5a.2 (BND-08's twin for API requests, LIM-02).
-- ---------------------------------------------------------------------------------------------

-- The application role adds each minute's requests to their day and reads the days back; it deletes them only at
-- LIF-19's day-60 deletion, with the shop's other request counts.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.api_usage_daily TO lytronix_app;
  END IF;
END $$;
