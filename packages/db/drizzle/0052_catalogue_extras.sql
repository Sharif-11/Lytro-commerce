CREATE TABLE IF NOT EXISTS "tenant"."size_charts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid,
	"category_id" uuid,
	"table_rows" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "size_charts_owner_check" CHECK (("tenant"."size_charts"."product_id" IS NULL) <> ("tenant"."size_charts"."category_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."option_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"name" varchar(60) NOT NULL,
	"preset_key" text,
	"options" text[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "option_sets_options_check" CHECK (cardinality("tenant"."option_sets"."options") BETWEEN 1 AND 50),
	CONSTRAINT "option_sets_preset_check" CHECK ("tenant"."option_sets"."tenant_id" IS NULL OR "tenant"."option_sets"."preset_key" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "tenant"."categories" ADD COLUMN "behaves_like" text;--> statement-breakpoint
ALTER TABLE "tenant"."attribute_options" ADD COLUMN "swatch_color" varchar(7);--> statement-breakpoint
ALTER TABLE "control"."business_type_presets" ADD COLUMN "up_front_fields" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."size_charts" ADD CONSTRAINT "size_charts_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "tenant"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."size_charts" ADD CONSTRAINT "size_charts_category_fk" FOREIGN KEY ("tenant_id","category_id") REFERENCES "tenant"."categories"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "size_charts_product_idx" ON "tenant"."size_charts" USING btree ("tenant_id","product_id") WHERE "tenant"."size_charts"."product_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "size_charts_category_idx" ON "tenant"."size_charts" USING btree ("tenant_id","category_id") WHERE "tenant"."size_charts"."category_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "option_sets_tenant_name_idx" ON "tenant"."option_sets" USING btree ("tenant_id",lower("name")) WHERE "tenant"."option_sets"."tenant_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "option_sets_platform_name_idx" ON "tenant"."option_sets" USING btree (lower("name")) WHERE "tenant"."option_sets"."tenant_id" IS NULL;--> statement-breakpoint
ALTER TABLE "tenant"."attribute_options" ADD CONSTRAINT "attribute_options_swatch_check" CHECK ("tenant"."attribute_options"."swatch_color" ~ '^#[0-9A-Fa-f]{6}$');
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written security, grants and seed data (not expressible in Drizzle). Reviewed with the schema above.
-- DATABASE-SCHEMA §3.2, Phase 3 Slice 1b.
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
ALTER TABLE tenant.size_charts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.size_charts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.size_charts USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
-- ATR-16: option sets have the attribute library's two scopes (migration 0051): a shop reads the platform's sets
-- and its own, and writes only its own.
ALTER TABLE tenant.option_sets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.option_sets FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY platform_or_own_read ON tenant.option_sets FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
CREATE POLICY own_insert ON tenant.option_sets FOR INSERT WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
CREATE POLICY own_update ON tenant.option_sets FOR UPDATE USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
CREATE POLICY own_delete ON tenant.option_sets FOR DELETE USING (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
-- PST-04, ATL-01, ATR-16: the operator curates the platform's rows of the library. A transaction that turns on
-- app.platform_curation (TransactionRunner.enablePlatformCuration, operator routes only) may write rows with no
-- tenant, and only those; a shop's transaction never sets it, so its writes stay its own.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attributes', 'attribute_options', 'option_sets']
  LOOP
    EXECUTE format(
      'CREATE POLICY platform_curation ON tenant.%I '
      'USING (tenant_id IS NULL AND current_setting(''app.platform_curation'', true) = ''on'') '
      'WITH CHECK (tenant_id IS NULL AND current_setting(''app.platform_curation'', true) = ''on'')', t);
  END LOOP;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.size_charts, tenant.option_sets TO lytronix_app;
    GRANT UPDATE ON control.business_type_presets TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- ATR-18, ATR-16: the platform's common colours, each with its swatch, as options of the platform "Color".
INSERT INTO tenant.attribute_options (attribute_id, tenant_id, value, swatch_color, sort_order)
SELECT a.id, NULL, c.value, c.swatch, c.sort_order
FROM tenant.attributes a
CROSS JOIN (VALUES
  ('Black', '#000000', 1),
  ('White', '#FFFFFF', 2),
  ('Red', '#D32F2F', 3),
  ('Maroon', '#7B1E1E', 4),
  ('Pink', '#EC407A', 5),
  ('Orange', '#FB8C00', 6),
  ('Yellow', '#FDD835', 7),
  ('Green', '#388E3C', 8),
  ('Olive', '#6B7A2A', 9),
  ('Sky blue', '#81D4FA', 10),
  ('Blue', '#1E88E5', 11),
  ('Navy', '#1A237E', 12),
  ('Purple', '#7B1FA2', 13),
  ('Brown', '#6D4C41', 14),
  ('Beige', '#D7C4A3', 15),
  ('Grey', '#9E9E9E', 16),
  ('Golden', '#D4AF37', 17),
  ('Silver', '#C0C0C0', 18)
) AS c(value, swatch, sort_order)
WHERE a.tenant_id IS NULL AND a.name = 'Color';
--> statement-breakpoint
-- ATR-16: the platform's option sets. A set naming a shop type is offered first to shops of that type.
INSERT INTO tenant.option_sets (tenant_id, name, preset_key, options, sort_order) VALUES
  (NULL, 'S–XXL', 'clothing', ARRAY['S', 'M', 'L', 'XL', 'XXL'], 1),
  (NULL, 'Shoe 38–44', 'shoes_bags', ARRAY['38', '39', '40', '41', '42', '43', '44'], 2),
  (NULL, 'Common colors', NULL, ARRAY['Black', 'White', 'Red', 'Maroon', 'Pink', 'Orange', 'Yellow', 'Green',
    'Olive', 'Sky blue', 'Blue', 'Navy', 'Purple', 'Brown', 'Beige', 'Grey', 'Golden', 'Silver'], 3);
--> statement-breakpoint
-- PST-05: the optional product-form fields each shop type shows up front.
UPDATE control.business_type_presets p SET up_front_fields = f.fields
FROM (VALUES
  ('electronics', ARRAY['serialTracked', 'itemCondition']),
  ('mobiles_gadgets', ARRAY['serialTracked', 'itemCondition']),
  ('clothing', ARRAY['sizeChart']),
  ('shoes_bags', ARRAY['sizeChart']),
  ('cosmetics', ARRAY['batchTracked']),
  ('grocery', ARRAY['batchTracked']),
  ('pharmacy', ARRAY['batchTracked']),
  ('food_bakery', ARRAY['stockTracking'])
) AS f(key, fields)
WHERE p.key = f.key;
