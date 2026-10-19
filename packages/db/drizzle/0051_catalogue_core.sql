CREATE TYPE "tenant"."delivery_mode" AS ENUM('default', 'adjustable');--> statement-breakpoint
CREATE TYPE "tenant"."payment_policy" AS ENUM('none', 'delivery_charge_only', 'partial_advance', 'full_prepayment');--> statement-breakpoint
CREATE TYPE "tenant"."stock_state" AS ENUM('in', 'low', 'out');--> statement-breakpoint
CREATE TYPE "tenant"."stock_tracking" AS ENUM('tracked', 'not_tracked');--> statement-breakpoint
CREATE TYPE "tenant"."stock_unit" AS ENUM('piece', 'kg', 'g', 'liter', 'ml', 'dozen', 'pack', 'box');--> statement-breakpoint
CREATE TYPE "tenant"."attribute_data_type" AS ENUM('enum_single', 'enum_multi', 'number_with_unit', 'text', 'boolean');--> statement-breakpoint
CREATE TYPE "tenant"."attribute_role" AS ENUM('variant_defining', 'informational', 'captured_at_order');--> statement-breakpoint
CREATE TYPE "tenant"."unit_kind" AS ENUM('weight', 'volume', 'count');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."catalogue_state" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" varchar(80) NOT NULL,
	"slug" text NOT NULL,
	"depth" smallint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_tenant_slug_key" UNIQUE("tenant_id","slug"),
	CONSTRAINT "categories_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "categories_depth_check" CHECK ("tenant"."categories"."depth" BETWEEN 1 AND 4)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."product_categories" (
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "product_categories_tenant_id_product_id_category_id_pk" PRIMARY KEY("tenant_id","product_id","category_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."product_slug_redirects" (
	"tenant_id" uuid NOT NULL,
	"old_slug" text NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_slug_redirects_pkey" PRIMARY KEY("tenant_id","old_slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"combination_key" text DEFAULT '' NOT NULL,
	"sku" text,
	"barcode" text,
	"price" numeric(10, 2),
	"weight_kg" numeric(10, 3),
	"delivery_charge" numeric(10, 2),
	"delivery_mode" "tenant"."delivery_mode",
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "product_variants_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "product_variants_tenant_product_id_key" UNIQUE("tenant_id","product_id","id"),
	CONSTRAINT "product_variants_product_combination_key" UNIQUE("product_id","combination_key"),
	CONSTRAINT "product_variants_price_check" CHECK ("tenant"."product_variants"."price" >= 0),
	CONSTRAINT "product_variants_weight_check" CHECK ("tenant"."product_variants"."weight_kg" > 0),
	CONSTRAINT "product_variants_delivery_charge_check" CHECK ("tenant"."product_variants"."delivery_charge" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"base_price" numeric(10, 2) NOT NULL,
	"stock_unit" "tenant"."stock_unit" DEFAULT 'piece' NOT NULL,
	"stock_tracking" "tenant"."stock_tracking" DEFAULT 'tracked' NOT NULL,
	"batch_tracked" boolean DEFAULT false NOT NULL,
	"serial_tracked" boolean DEFAULT false NOT NULL,
	"low_stock_threshold" numeric(14, 3) DEFAULT '5' NOT NULL,
	"delivery_charge" numeric(10, 2),
	"weight_kg" numeric(10, 3),
	"delivery_mode" "tenant"."delivery_mode" DEFAULT 'default' NOT NULL,
	"payment_policy" "tenant"."payment_policy",
	"advance_amount" numeric(10, 2),
	"primary_category_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"min_price" numeric(10, 2),
	"max_price" numeric(10, 2),
	"stock_state" "tenant"."stock_state" DEFAULT 'out' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "products_tenant_slug_key" UNIQUE("tenant_id","slug"),
	CONSTRAINT "products_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "products_base_price_check" CHECK ("tenant"."products"."base_price" >= 0),
	CONSTRAINT "products_low_stock_check" CHECK ("tenant"."products"."low_stock_threshold" >= 0),
	CONSTRAINT "products_delivery_charge_check" CHECK ("tenant"."products"."delivery_charge" >= 0),
	CONSTRAINT "products_weight_check" CHECK ("tenant"."products"."weight_kg" > 0),
	CONSTRAINT "products_tracking_check" CHECK (NOT ("tenant"."products"."stock_tracking" = 'not_tracked' AND ("tenant"."products"."batch_tracked" OR "tenant"."products"."serial_tracked"))),
	CONSTRAINT "products_batch_serial_check" CHECK (NOT ("tenant"."products"."batch_tracked" AND "tenant"."products"."serial_tracked")),
	CONSTRAINT "products_advance_check" CHECK (CASE WHEN "tenant"."products"."payment_policy" = 'partial_advance' THEN "tenant"."products"."advance_amount" IS NOT NULL AND "tenant"."products"."advance_amount" >= 0 ELSE "tenant"."products"."advance_amount" IS NULL END)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."attribute_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attribute_id" uuid NOT NULL,
	"tenant_id" uuid,
	"value" varchar(80) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attribute_options_attribute_id_key" UNIQUE("attribute_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"name" varchar(80) NOT NULL,
	"data_type" "tenant"."attribute_data_type" NOT NULL,
	"unit_kind" "tenant"."unit_kind",
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attributes_unit_check" CHECK (("tenant"."attributes"."data_type" = 'number_with_unit') = ("tenant"."attributes"."unit_kind" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."category_attributes" (
	"tenant_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"attribute_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "category_attributes_tenant_id_category_id_attribute_id_pk" PRIMARY KEY("tenant_id","category_id","attribute_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."product_attribute_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"attribute_id" uuid NOT NULL,
	"option_id" uuid,
	"text_value" text,
	"number_value" numeric(14, 4),
	"bool_value" boolean,
	CONSTRAINT "product_attribute_values_one_value_check" CHECK (num_nonnulls("tenant"."product_attribute_values"."option_id", "tenant"."product_attribute_values"."text_value", "tenant"."product_attribute_values"."number_value", "tenant"."product_attribute_values"."bool_value") = 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."product_attributes" (
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"attribute_id" uuid NOT NULL,
	"role" "tenant"."attribute_role" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_attributes_tenant_id_product_id_attribute_id_pk" PRIMARY KEY("tenant_id","product_id","attribute_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."variant_attribute_values" (
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"attribute_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	CONSTRAINT "variant_attribute_values_tenant_id_variant_id_attribute_id_pk" PRIMARY KEY("tenant_id","variant_id","attribute_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."business_type_presets" (
	"key" text PRIMARY KEY NOT NULL,
	"label_bn" text NOT NULL,
	"label_en" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"default_stock_unit" "tenant"."stock_unit" DEFAULT 'piece' NOT NULL,
	"default_batch" boolean DEFAULT false NOT NULL,
	"default_serial" boolean DEFAULT false NOT NULL,
	"default_not_tracked" boolean DEFAULT false NOT NULL,
	"default_low_stock" numeric(14, 3) DEFAULT '5' NOT NULL,
	"suggested_attribute_ids" uuid[] DEFAULT '{}' NOT NULL,
	"suggested_categories" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "control"."tenants" ADD COLUMN "business_type" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."categories" ADD CONSTRAINT "categories_parent_fk" FOREIGN KEY ("tenant_id","parent_id") REFERENCES "tenant"."categories"("tenant_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."product_categories" ADD CONSTRAINT "product_categories_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "tenant"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."product_categories" ADD CONSTRAINT "product_categories_category_fk" FOREIGN KEY ("tenant_id","category_id") REFERENCES "tenant"."categories"("tenant_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."product_slug_redirects" ADD CONSTRAINT "product_slug_redirects_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "tenant"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."product_variants" ADD CONSTRAINT "product_variants_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "tenant"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."products" ADD CONSTRAINT "products_primary_category_fk" FOREIGN KEY ("tenant_id","primary_category_id") REFERENCES "tenant"."categories"("tenant_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."attribute_options" ADD CONSTRAINT "attribute_options_attribute_id_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "tenant"."attributes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."category_attributes" ADD CONSTRAINT "category_attributes_attribute_id_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "tenant"."attributes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."category_attributes" ADD CONSTRAINT "category_attributes_category_fk" FOREIGN KEY ("tenant_id","category_id") REFERENCES "tenant"."categories"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."product_attribute_values" ADD CONSTRAINT "product_attribute_values_attribute_fk" FOREIGN KEY ("tenant_id","product_id","attribute_id") REFERENCES "tenant"."product_attributes"("tenant_id","product_id","attribute_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."product_attribute_values" ADD CONSTRAINT "product_attribute_values_option_fk" FOREIGN KEY ("attribute_id","option_id") REFERENCES "tenant"."attribute_options"("attribute_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."product_attributes" ADD CONSTRAINT "product_attributes_attribute_id_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "tenant"."attributes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."product_attributes" ADD CONSTRAINT "product_attributes_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "tenant"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."variant_attribute_values" ADD CONSTRAINT "variant_attribute_values_variant_fk" FOREIGN KEY ("tenant_id","product_id","variant_id") REFERENCES "tenant"."product_variants"("tenant_id","product_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."variant_attribute_values" ADD CONSTRAINT "variant_attribute_values_attribute_fk" FOREIGN KEY ("tenant_id","product_id","attribute_id") REFERENCES "tenant"."product_attributes"("tenant_id","product_id","attribute_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."variant_attribute_values" ADD CONSTRAINT "variant_attribute_values_option_fk" FOREIGN KEY ("attribute_id","option_id") REFERENCES "tenant"."attribute_options"("attribute_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "categories_tenant_parent_idx" ON "tenant"."categories" USING btree ("tenant_id","parent_id","sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_categories_category_idx" ON "tenant"."product_categories" USING btree ("tenant_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_tenant_sku_idx" ON "tenant"."product_variants" USING btree ("tenant_id","sku") WHERE "tenant"."product_variants"."sku" IS NOT NULL AND "tenant"."product_variants"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_tenant_category_idx" ON "tenant"."products" USING btree ("tenant_id","primary_category_id","sort_order") WHERE "tenant"."products"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_tenant_created_idx" ON "tenant"."products" USING btree ("tenant_id","created_at") WHERE "tenant"."products"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attribute_options_platform_value_idx" ON "tenant"."attribute_options" USING btree ("attribute_id",lower("value")) WHERE "tenant"."attribute_options"."tenant_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attribute_options_tenant_value_idx" ON "tenant"."attribute_options" USING btree ("tenant_id","attribute_id",lower("value")) WHERE "tenant"."attribute_options"."tenant_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attributes_tenant_name_idx" ON "tenant"."attributes" USING btree ("tenant_id",lower("name")) WHERE "tenant"."attributes"."tenant_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attributes_platform_name_idx" ON "tenant"."attributes" USING btree (lower("name")) WHERE "tenant"."attributes"."tenant_id" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_attribute_values_product_idx" ON "tenant"."product_attribute_values" USING btree ("tenant_id","product_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."tenants" ADD CONSTRAINT "tenants_business_type_business_type_presets_key_fk" FOREIGN KEY ("business_type") REFERENCES "control"."business_type_presets"("key") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written security, triggers, grants and seed data (not expressible in Drizzle). Reviewed with the
-- schema above. DATABASE-SCHEMA §3.2, Phase 3 Slice 1.
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['catalogue_state', 'categories', 'products', 'product_categories',
    'product_variants', 'product_slug_redirects', 'product_attributes', 'product_attribute_values',
    'variant_attribute_values', 'category_attributes']
  LOOP
    EXECUTE format('ALTER TABLE tenant.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE tenant.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON tenant.%I USING (tenant_id = tenant.current_tenant_id()) '
      'WITH CHECK (tenant_id = tenant.current_tenant_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- ATL-01: the attribute library has two scopes. A shop reads the platform's rows and its own, and writes only its
-- own; platform rows are written by migrations and, later, the operator (PST-04, ATL-01 curation).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attributes', 'attribute_options']
  LOOP
    EXECUTE format('ALTER TABLE tenant.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE tenant.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY platform_or_own_read ON tenant.%I FOR SELECT '
      'USING (tenant_id IS NULL OR tenant_id = tenant.current_tenant_id())', t);
    EXECUTE format(
      'CREATE POLICY own_insert ON tenant.%I FOR INSERT WITH CHECK (tenant_id = tenant.current_tenant_id())', t);
    EXECUTE format(
      'CREATE POLICY own_update ON tenant.%I FOR UPDATE USING (tenant_id = tenant.current_tenant_id()) '
      'WITH CHECK (tenant_id = tenant.current_tenant_id())', t);
    EXECUTE format(
      'CREATE POLICY own_delete ON tenant.%I FOR DELETE USING (tenant_id = tenant.current_tenant_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- SEC-02, TEN-03: foreign keys are checked past row-level security, so a shop could otherwise point at another
-- shop's attribute or option by its id. Every such reference must be the platform's or the row's own shop's.
-- Runs as the caller, so under the application role another shop's row is simply not found.
CREATE FUNCTION tenant.check_attribute_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  owner uuid;
  kind tenant.attribute_data_type;
BEGIN
  SELECT a.tenant_id, a.data_type INTO owner, kind FROM tenant.attributes a WHERE a.id = NEW.attribute_id;
  IF NOT FOUND OR (owner IS NOT NULL AND owner IS DISTINCT FROM NEW.tenant_id) THEN
    RAISE EXCEPTION 'attribute % is not available to this shop', NEW.attribute_id
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'catalogue_attribute_scope';
  END IF;
  -- ATL-01: only an attribute with options holds options.
  IF TG_TABLE_NAME = 'attribute_options' AND kind NOT IN ('enum_single', 'enum_multi', 'number_with_unit') THEN
    RAISE EXCEPTION 'a % attribute has no options', kind
      USING ERRCODE = 'check_violation', CONSTRAINT = 'catalogue_option_type';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION tenant.check_option_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  owner uuid;
BEGIN
  IF NEW.option_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT o.tenant_id INTO owner FROM tenant.attribute_options o WHERE o.id = NEW.option_id;
  IF NOT FOUND OR (owner IS NOT NULL AND owner IS DISTINCT FROM NEW.tenant_id) THEN
    RAISE EXCEPTION 'option % is not available to this shop', NEW.option_id
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'catalogue_option_scope';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER attribute_options_scope BEFORE INSERT OR UPDATE OF attribute_id, tenant_id
  ON tenant.attribute_options FOR EACH ROW EXECUTE FUNCTION tenant.check_attribute_scope();
--> statement-breakpoint
CREATE TRIGGER product_attributes_scope BEFORE INSERT OR UPDATE OF attribute_id, tenant_id
  ON tenant.product_attributes FOR EACH ROW EXECUTE FUNCTION tenant.check_attribute_scope();
--> statement-breakpoint
CREATE TRIGGER category_attributes_scope BEFORE INSERT OR UPDATE OF attribute_id, tenant_id
  ON tenant.category_attributes FOR EACH ROW EXECUTE FUNCTION tenant.check_attribute_scope();
--> statement-breakpoint
CREATE TRIGGER product_attribute_values_scope BEFORE INSERT OR UPDATE OF option_id, tenant_id
  ON tenant.product_attribute_values FOR EACH ROW EXECUTE FUNCTION tenant.check_option_scope();
--> statement-breakpoint
CREATE TRIGGER variant_attribute_values_scope BEFORE INSERT OR UPDATE OF option_id, tenant_id
  ON tenant.variant_attribute_values FOR EACH ROW EXECUTE FUNCTION tenant.check_option_scope();
--> statement-breakpoint
-- ATL-01: an attribute's type never changes; products already rely on it.
CREATE FUNCTION tenant.keep_attribute_type() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.data_type IS DISTINCT FROM OLD.data_type OR NEW.unit_kind IS DISTINCT FROM OLD.unit_kind
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'an attribute keeps its type, unit and owner'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'catalogue_attribute_fixed';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER attributes_fixed BEFORE UPDATE ON tenant.attributes
  FOR EACH ROW EXECUTE FUNCTION tenant.keep_attribute_type();
--> statement-breakpoint
-- ATL-02, ATL-03 (ATR-14): a variant-defining attribute is one with options to split on, never enum-multi, and a
-- product has at most three. The product row is locked first, so two writes count in turn.
CREATE FUNCTION tenant.check_product_attribute() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  kind tenant.attribute_data_type;
  splitting integer;
BEGIN
  IF NEW.role <> 'variant_defining' THEN
    IF TG_OP = 'UPDATE' AND OLD.role = 'variant_defining' AND EXISTS (
      SELECT 1 FROM tenant.variant_attribute_values v
      WHERE v.tenant_id = NEW.tenant_id AND v.product_id = NEW.product_id AND v.attribute_id = NEW.attribute_id
    ) THEN
      RAISE EXCEPTION 'attribute % still names variants', NEW.attribute_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'catalogue_attribute_in_use';
    END IF;
    RETURN NEW;
  END IF;
  SELECT a.data_type INTO kind FROM tenant.attributes a WHERE a.id = NEW.attribute_id;
  IF kind = 'enum_multi' THEN
    RAISE EXCEPTION 'an attribute that takes several values cannot define variants'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'catalogue_variant_multi';
  END IF;
  IF kind NOT IN ('enum_single', 'number_with_unit') THEN
    RAISE EXCEPTION 'a % attribute has no options to define variants', kind
      USING ERRCODE = 'check_violation', CONSTRAINT = 'catalogue_variant_type';
  END IF;
  PERFORM 1 FROM tenant.products p WHERE p.tenant_id = NEW.tenant_id AND p.id = NEW.product_id FOR UPDATE;
  SELECT count(*) INTO splitting FROM tenant.product_attributes pa
  WHERE pa.tenant_id = NEW.tenant_id AND pa.product_id = NEW.product_id
    AND pa.role = 'variant_defining' AND pa.attribute_id <> NEW.attribute_id;
  IF splitting >= 3 THEN
    RAISE EXCEPTION 'a product has at most 3 variant-defining attributes'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'catalogue_variant_attribute_limit';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER product_attributes_role BEFORE INSERT OR UPDATE OF role, attribute_id
  ON tenant.product_attributes FOR EACH ROW EXECUTE FUNCTION tenant.check_product_attribute();
--> statement-breakpoint
-- ATL-04: a variant's values name its product's variant-defining attributes only.
CREATE FUNCTION tenant.check_variant_value() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tenant.product_attributes pa
    WHERE pa.tenant_id = NEW.tenant_id AND pa.product_id = NEW.product_id
      AND pa.attribute_id = NEW.attribute_id AND pa.role = 'variant_defining'
  ) THEN
    RAISE EXCEPTION 'attribute % does not define this product''s variants', NEW.attribute_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'catalogue_variant_value_role';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER variant_attribute_values_role BEFORE INSERT OR UPDATE
  ON tenant.variant_attribute_values FOR EACH ROW EXECUTE FUNCTION tenant.check_variant_value();
--> statement-breakpoint
-- ATL-03 (ATR-14): at most 100 live variants per product, counting a retired one brought back.
CREATE FUNCTION tenant.check_variant_limit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  live integer;
BEGIN
  IF NEW.deleted_at IS NOT NULL OR (TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL) THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM tenant.products p WHERE p.tenant_id = NEW.tenant_id AND p.id = NEW.product_id FOR UPDATE;
  SELECT count(*) INTO live FROM tenant.product_variants v
  WHERE v.tenant_id = NEW.tenant_id AND v.product_id = NEW.product_id AND v.deleted_at IS NULL AND v.id <> NEW.id;
  IF live >= 100 THEN
    RAISE EXCEPTION 'a product has at most 100 variants'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'catalogue_variant_limit';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER product_variants_limit BEFORE INSERT OR UPDATE OF deleted_at
  ON tenant.product_variants FOR EACH ROW EXECUTE FUNCTION tenant.check_variant_limit();
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.catalogue_state, tenant.categories, tenant.products,
      tenant.product_categories, tenant.product_variants, tenant.product_slug_redirects, tenant.attributes,
      tenant.attribute_options, tenant.product_attributes, tenant.product_attribute_values,
      tenant.variant_attribute_values, tenant.category_attributes TO lytronix_app;
    GRANT SELECT ON control.business_type_presets TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- ATL-01: the platform's attribute library. A number with a unit holds numbers in its kind's base unit
-- (UOM-02): grams for weight, millilitres for volume, a plain count.
INSERT INTO tenant.attributes (tenant_id, name, data_type, unit_kind) VALUES
  (NULL, 'Size', 'enum_single', NULL),
  (NULL, 'Color', 'enum_single', NULL),
  (NULL, 'Fabric', 'enum_single', NULL),
  (NULL, 'Material', 'enum_single', NULL),
  (NULL, 'Shade', 'enum_single', NULL),
  (NULL, 'Skin type', 'enum_multi', NULL),
  (NULL, 'Brand', 'enum_single', NULL),
  (NULL, 'Warranty', 'text', NULL),
  (NULL, 'Compatible models', 'enum_multi', NULL),
  (NULL, 'Storage', 'enum_single', NULL),
  (NULL, 'RAM', 'enum_single', NULL),
  (NULL, 'Pack size', 'number_with_unit', 'count'),
  (NULL, 'Flavour', 'enum_single', NULL),
  (NULL, 'Author', 'text', NULL),
  (NULL, 'Publisher', 'text', NULL),
  (NULL, 'Edition', 'text', NULL),
  (NULL, 'Strength', 'number_with_unit', 'weight');
--> statement-breakpoint
-- PST-01, PST-02 (PHASE-3-PLAN §6, Slice 1): the shop types, keyed and labelled as the dashboard's set-up step
-- shows them, with each type's suggested platform attributes in order.
INSERT INTO control.business_type_presets
  (key, label_en, label_bn, sort_order, default_stock_unit, default_batch, default_serial, default_not_tracked,
   suggested_attribute_ids)
SELECT p.key, p.label_en, p.label_bn, p.sort_order, p.unit::tenant.stock_unit, p.batch, p.serial, p.not_tracked,
  coalesce((
    SELECT array_agg(a.id ORDER BY array_position(p.names, a.name::text))
    FROM tenant.attributes a WHERE a.tenant_id IS NULL AND a.name = ANY (p.names)
  ), '{}')
FROM (VALUES
  ('clothing', 'Clothing', 'পোশাক', 1, 'piece', false, false, false, ARRAY['Size', 'Color', 'Fabric']),
  ('shoes_bags', 'Shoes and bags', 'জুতা ও ব্যাগ', 2, 'piece', false, false, false, ARRAY['Size', 'Color', 'Material']),
  ('cosmetics', 'Cosmetics', 'কসমেটিক্স', 3, 'piece', true, false, false, ARRAY['Shade', 'Size', 'Skin type']),
  ('electronics', 'Electronics', 'ইলেকট্রনিক্স', 4, 'piece', false, true, false,
    ARRAY['Brand', 'Warranty', 'Compatible models']),
  ('mobiles_gadgets', 'Mobiles and gadgets', 'মোবাইল ও গ্যাজেট', 5, 'piece', false, true, false,
    ARRAY['Storage', 'RAM', 'Color']),
  ('grocery', 'Grocery', 'মুদি', 6, 'kg', true, false, false, ARRAY['Pack size', 'Brand']),
  ('food_bakery', 'Food and bakery', 'খাবার ও বেকারি', 7, 'piece', false, false, true, ARRAY['Size', 'Flavour']),
  ('books_stationery', 'Books and stationery', 'বই ও স্টেশনারি', 8, 'piece', false, false, false,
    ARRAY['Author', 'Publisher', 'Edition']),
  ('pharmacy', 'Pharmacy', 'ফার্মেসি', 9, 'box', true, false, false, ARRAY['Strength', 'Pack size']),
  ('home_decor', 'Home and décor', 'হোম ও ডেকোর', 10, 'piece', false, false, false,
    ARRAY['Color', 'Material', 'Size']),
  ('other', 'Other', 'অন্যান্য', 11, 'piece', false, false, false, ARRAY[]::text[])
) AS p(key, label_en, label_bn, sort_order, unit, batch, serial, not_tracked, names);
