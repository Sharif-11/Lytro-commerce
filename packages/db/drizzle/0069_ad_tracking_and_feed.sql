CREATE TYPE "tenant"."item_condition" AS ENUM('new', 'refurbished', 'used');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."ad_tracking_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"meta_pixel_id" text,
	"meta_capi_token_enc" "bytea",
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."catalog_feeds" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"token_enc" "bytea" NOT NULL,
	"rotated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_feeds_token_hash_key" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "tenant"."products" ADD COLUMN "item_condition" "tenant"."item_condition" DEFAULT 'new' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."catalog_feeds" ADD CONSTRAINT "catalog_feeds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written: row-level security and grants (not expressible in Drizzle). DATABASE-SCHEMA §3.2 and §3.5, Phase 3
-- Slice 9b (LND-15 to LND-17, FED-01, FED-02, FED-05).
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
ALTER TABLE tenant.ad_tracking_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.ad_tracking_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant.ad_tracking_settings
  USING (tenant_id = tenant.current_tenant_id()) WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.ad_tracking_settings TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.catalog_feeds TO lytronix_app;
  END IF;
END $$;
