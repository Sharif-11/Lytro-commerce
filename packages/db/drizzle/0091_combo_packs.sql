CREATE TYPE "tenant"."product_kind" AS ENUM('standard', 'combo');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."combo_part_variants" (
	"tenant_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "combo_part_variants_part_id_variant_id_pk" PRIMARY KEY("part_id","variant_id"),
	CONSTRAINT "combo_part_variants_position_key" UNIQUE("part_id","position"),
	CONSTRAINT "combo_part_variants_position_check" CHECK ("tenant"."combo_part_variants"."position" BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."combo_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"combo_product_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	CONSTRAINT "combo_parts_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "combo_parts_position_key" UNIQUE("combo_product_id","position"),
	CONSTRAINT "combo_parts_position_check" CHECK ("tenant"."combo_parts"."position" BETWEEN 1 AND 10),
	CONSTRAINT "combo_parts_quantity_check" CHECK ("tenant"."combo_parts"."quantity" > 0 AND "tenant"."combo_parts"."quantity" <= 20)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."order_line_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_line_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"part_position" integer NOT NULL,
	"product_id" uuid,
	"variant_id" uuid,
	"product_name" varchar(200) NOT NULL,
	"attribute_values" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	CONSTRAINT "order_line_components_position_key" UNIQUE("order_line_id","position"),
	CONSTRAINT "order_line_components_position_check" CHECK ("tenant"."order_line_components"."position" > 0),
	CONSTRAINT "order_line_components_quantity_check" CHECK ("tenant"."order_line_components"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "tenant"."products" ADD COLUMN "kind" "tenant"."product_kind" DEFAULT 'standard' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."combo_part_variants" ADD CONSTRAINT "combo_part_variants_part_fk" FOREIGN KEY ("tenant_id","part_id") REFERENCES "tenant"."combo_parts"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."combo_part_variants" ADD CONSTRAINT "combo_part_variants_variant_fk" FOREIGN KEY ("tenant_id","variant_id") REFERENCES "tenant"."product_variants"("tenant_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."combo_parts" ADD CONSTRAINT "combo_parts_product_fk" FOREIGN KEY ("tenant_id","combo_product_id") REFERENCES "tenant"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."order_line_components" ADD CONSTRAINT "order_line_components_line_fk" FOREIGN KEY ("tenant_id","order_line_id") REFERENCES "tenant"."order_lines"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "combo_part_variants_variant_idx" ON "tenant"."combo_part_variants" USING btree ("tenant_id","variant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_line_components_line_idx" ON "tenant"."order_line_components" USING btree ("tenant_id","order_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_line_components_variant_idx" ON "tenant"."order_line_components" USING btree ("tenant_id","variant_id");--> statement-breakpoint
ALTER TABLE "tenant"."products" ADD CONSTRAINT "products_combo_check" CHECK ("tenant"."products"."kind" <> 'combo' OR ("tenant"."products"."stock_tracking" = 'not_tracked' AND NOT "tenant"."products"."batch_tracked"
        AND NOT "tenant"."products"."serial_tracked" AND NOT "tenant"."products"."shared_stock"));
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written isolation, grants and the parts' rule (not expressible in Drizzle). Phase 4 Slice 4.5, CMB-01 to
-- CMB-10, agreed 2026-10-30.
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['combo_parts', 'combo_part_variants', 'order_line_components']
  LOOP
    EXECUTE format('ALTER TABLE tenant.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE tenant.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON tenant.%I USING (tenant_id = tenant.current_tenant_id()) '
      'WITH CHECK (tenant_id = tenant.current_tenant_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- The application role writes a combo's parts (replaced whole on a change) and a combo line's components (written
-- again when an order is edited).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.combo_parts, tenant.combo_part_variants,
      tenant.order_line_components TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- CMB-01, CMB-10: a part belongs to a combo, and may be any variant of an ordinary product -- never a combo (no combo
-- inside a combo) nor a shared stock's hidden holder -- and at most 100 of them.
CREATE FUNCTION tenant.check_combo_part_variant() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tenant.combo_parts cp
    JOIN tenant.products c ON c.tenant_id = cp.tenant_id AND c.id = cp.combo_product_id
    WHERE cp.tenant_id = NEW.tenant_id AND cp.id = NEW.part_id AND c.kind = 'combo'
  ) THEN
    RAISE EXCEPTION 'only a combo has parts'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'combo_part_variants_kind_check';
  END IF;
  IF EXISTS (
    SELECT 1 FROM tenant.product_variants v
    JOIN tenant.products p ON p.tenant_id = v.tenant_id AND p.id = v.product_id
    WHERE v.tenant_id = NEW.tenant_id AND v.id = NEW.variant_id AND (p.kind = 'combo' OR v.is_stock_holder)
  ) THEN
    RAISE EXCEPTION 'a combo part is a variant of an ordinary product'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'combo_part_variants_kind_check';
  END IF;
  IF (
    SELECT count(*) FROM tenant.combo_part_variants
    WHERE tenant_id = NEW.tenant_id AND part_id = NEW.part_id
  ) > 100 THEN
    RAISE EXCEPTION 'at most 100 variants a part'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'combo_part_variants_count_check';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER combo_part_variants_check AFTER INSERT OR UPDATE ON tenant.combo_part_variants
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION tenant.check_combo_part_variant();
--> statement-breakpoint
-- CMB-01 (agreed 2026-10-30): a product is a combo, or not, from its creation; its kind never changes.
CREATE FUNCTION tenant.keep_product_kind() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind IS DISTINCT FROM OLD.kind THEN
    RAISE EXCEPTION 'a product''s kind is chosen when it is made'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'products_kind_fixed';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER products_kind_fixed BEFORE UPDATE OF kind ON tenant.products
  FOR EACH ROW EXECUTE FUNCTION tenant.keep_product_kind();
