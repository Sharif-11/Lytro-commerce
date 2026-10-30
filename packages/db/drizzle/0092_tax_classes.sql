CREATE TABLE IF NOT EXISTS "tenant"."tax_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"rate" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_classes_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "tax_classes_rate_check" CHECK ("tenant"."tax_classes"."rate" >= 0 AND "tenant"."tax_classes"."rate" <= 100)
);
--> statement-breakpoint
ALTER TABLE "tenant"."shop_settings" ADD COLUMN "default_tax_class_id" uuid;--> statement-breakpoint
ALTER TABLE "tenant"."products" ADD COLUMN "tax_class_id" uuid;--> statement-breakpoint
ALTER TABLE "tenant"."order_lines" ADD COLUMN "tax_class_name" varchar(60);--> statement-breakpoint
ALTER TABLE "tenant"."order_lines" ADD COLUMN "tax_rate" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "tenant"."order_lines" ADD COLUMN "tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tax_classes_name_key" ON "tenant"."tax_classes" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."shop_settings" ADD CONSTRAINT "shop_settings_default_tax_class_fk" FOREIGN KEY ("tenant_id","default_tax_class_id") REFERENCES "tenant"."tax_classes"("tenant_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."products" ADD CONSTRAINT "products_tax_class_fk" FOREIGN KEY ("tenant_id","tax_class_id") REFERENCES "tenant"."tax_classes"("tenant_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "tenant"."order_lines" ADD CONSTRAINT "order_lines_tax_check" CHECK (("tenant"."order_lines"."tax_class_name" IS NULL) = ("tenant"."order_lines"."tax_rate" IS NULL) AND "tenant"."order_lines"."tax_amount" >= 0);
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written isolation and grants (not expressible in Drizzle). Phase 4 Slice 4.6a, TAX-01, agreed 2026-10-30.
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
ALTER TABLE tenant.tax_classes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.tax_classes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.tax_classes USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
-- The application role names, renames and removes a shop's classes; a class a product or the shop's default names is
-- kept by its foreign keys.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.tax_classes TO lytronix_app;
  END IF;
END $$;
