CREATE TABLE IF NOT EXISTS "tenant"."modifier_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"min_select" smallint NOT NULL,
	"max_select" smallint NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "modifier_groups_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "modifier_groups_select_check" CHECK ("tenant"."modifier_groups"."min_select" >= 0 AND "tenant"."modifier_groups"."max_select" >= 1 AND "tenant"."modifier_groups"."min_select" <= "tenant"."modifier_groups"."max_select")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."modifier_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"price_change" numeric(10, 2) DEFAULT '0' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"position" smallint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant"."order_lines" ADD COLUMN "modifiers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."modifier_groups" ADD CONSTRAINT "modifier_groups_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "tenant"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."modifier_options" ADD CONSTRAINT "modifier_options_group_fk" FOREIGN KEY ("tenant_id","group_id") REFERENCES "tenant"."modifier_groups"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "modifier_groups_product_idx" ON "tenant"."modifier_groups" USING btree ("tenant_id","product_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "modifier_options_group_idx" ON "tenant"."modifier_options" USING btree ("tenant_id","group_id","position");
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written isolation and grants (not expressible in Drizzle). Phase 4 Slice 4.6b, MNU-01, agreed 2026-10-30.
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['modifier_groups', 'modifier_options']
  LOOP
    EXECUTE format('ALTER TABLE tenant.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE tenant.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON tenant.%I USING (tenant_id = tenant.current_tenant_id()) '
      'WITH CHECK (tenant_id = tenant.current_tenant_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- The application role replaces a product's groups whole when it is saved; they go with the product.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.modifier_groups, tenant.modifier_options TO lytronix_app;
  END IF;
END $$;
