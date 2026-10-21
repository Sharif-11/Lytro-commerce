CREATE TABLE IF NOT EXISTS "control"."usage_warnings" (
	"tenant_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"cycle_start" timestamp with time zone NOT NULL,
	"warned_percent" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_warnings_pkey" PRIMARY KEY("tenant_id","metric","cycle_start")
);
--> statement-breakpoint
ALTER TABLE "control"."api_usage" ADD COLUMN "fast_spend_alerted_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."usage_warnings" ADD CONSTRAINT "usage_warnings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written: grants and settings. Phase 3 Slice 10's warnings (LIM-01, BND-03, RTE-03, RTE-12).
-- ---------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.usage_warnings TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- BND-03, RTE-03 (editable): a shop is still served this far past its bandwidth or API requests while its owner is
-- told; RTE-12 (editable): the share of a cycle's requests that, spent in one hour, alerts the owner and the operator.
INSERT INTO control.platform_settings (key, value, description) VALUES
  ('usage_grace_percent', '10', 'How far past its bandwidth or API request limit a shop is still served, as a percent of the limit (BND-03, RTE-03).'),
  ('fast_spend_percent', '5', 'The share of a cycle''s API requests that, spent in one hour, alerts the owner and the operator (RTE-12).')
ON CONFLICT (key) DO NOTHING;
