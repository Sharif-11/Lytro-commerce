CREATE TABLE IF NOT EXISTS "control"."media_bandwidth" (
	"tenant_id" uuid NOT NULL,
	"cycle_start" timestamp with time zone NOT NULL,
	"bytes" bigint DEFAULT 0 NOT NULL,
	"requests" bigint DEFAULT 0 NOT NULL,
	"warned_percent" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_bandwidth_pkey" PRIMARY KEY("tenant_id","cycle_start"),
	CONSTRAINT "media_bandwidth_counts_check" CHECK ("control"."media_bandwidth"."bytes" >= 0 AND "control"."media_bandwidth"."requests" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."media_bandwidth_daily" (
	"tenant_id" uuid NOT NULL,
	"cycle_start" timestamp with time zone NOT NULL,
	"day" date NOT NULL,
	"bytes" bigint DEFAULT 0 NOT NULL,
	"requests" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "media_bandwidth_daily_pkey" PRIMARY KEY("tenant_id","cycle_start","day"),
	CONSTRAINT "media_bandwidth_daily_counts_check" CHECK ("control"."media_bandwidth_daily"."bytes" >= 0 AND "control"."media_bandwidth_daily"."requests" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."media_usage_pull" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"pulled_until" timestamp with time zone NOT NULL,
	CONSTRAINT "media_usage_pull_one_row" CHECK ("control"."media_usage_pull"."id" = 1)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."media_bandwidth" ADD CONSTRAINT "media_bandwidth_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."media_bandwidth_daily" ADD CONSTRAINT "media_bandwidth_daily_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written grants and the first watermark (not expressible in Drizzle). DATABASE-SCHEMA §3.5, Phase 3 Slice 7b
-- (BND-01, BND-02, BND-05, BND-06, BND-08).
-- ---------------------------------------------------------------------------------------------

-- BND-02: the media Worker's usage is totalled from the moment this migration runs.
INSERT INTO control.media_usage_pull (id, pulled_until) VALUES (1, now()) ON CONFLICT (id) DO NOTHING;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.media_bandwidth TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.media_bandwidth_daily TO lytronix_app;
    GRANT SELECT, UPDATE ON control.media_usage_pull TO lytronix_app;
  END IF;
END $$;
