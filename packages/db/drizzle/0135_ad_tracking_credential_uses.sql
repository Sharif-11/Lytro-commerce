CREATE TABLE IF NOT EXISTS "tenant"."ad_tracking_credential_uses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"action" text NOT NULL,
	"order_id" uuid,
	"succeeded" boolean NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ad_tracking_credential_uses_tenant_idx" ON "tenant"."ad_tracking_credential_uses" USING btree ("tenant_id","at");--> statement-breakpoint
-- SEC-11 (Phase 9 Slice 9.7): each use of a shop's Conversions API token, its own, behind row-level security like every
-- tenant table.
ALTER TABLE tenant.ad_tracking_credential_uses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.ad_tracking_credential_uses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.ad_tracking_credential_uses USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    -- The log is only ever added to and read, and goes with the shop at day 60.
    GRANT SELECT, INSERT, DELETE ON tenant.ad_tracking_credential_uses TO lytronix_app;
  END IF;
END $$;
