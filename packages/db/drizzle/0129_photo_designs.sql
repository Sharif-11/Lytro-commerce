DROP INDEX IF EXISTS "tenant"."attribute_options_tenant_value_idx";--> statement-breakpoint
ALTER TABLE "tenant"."attribute_options" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "tenant"."attributes" ADD COLUMN "photo_designs" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant"."product_images" ADD COLUMN "design_option_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."attribute_options" ADD CONSTRAINT "attribute_options_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "tenant"."products"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attribute_options_product_value_idx" ON "tenant"."attribute_options" USING btree ("tenant_id","product_id","attribute_id",lower("value")) WHERE "tenant"."attribute_options"."product_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attributes_photo_designs_idx" ON "tenant"."attributes" USING btree ("photo_designs") WHERE "tenant"."attributes"."photo_designs";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_images_design_idx" ON "tenant"."product_images" USING btree ("tenant_id","design_option_id") WHERE "tenant"."product_images"."design_option_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attribute_options_tenant_value_idx" ON "tenant"."attribute_options" USING btree ("tenant_id","attribute_id",lower("value")) WHERE "tenant"."attribute_options"."tenant_id" IS NOT NULL AND "tenant"."attribute_options"."product_id" IS NULL;--> statement-breakpoint
ALTER TABLE "tenant"."attribute_options" ADD CONSTRAINT "attribute_options_tenant_id_key" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "tenant"."attribute_options" ADD CONSTRAINT "attribute_options_product_check" CHECK ("tenant"."attribute_options"."product_id" IS NULL OR "tenant"."attribute_options"."tenant_id" IS NOT NULL);
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------------------------
-- Hand-written (not expressible in Drizzle): photo designs (ATR-19, ATR-20, PHOTO-DESIGNS-PLAN PD-13).
-- ---------------------------------------------------------------------------------------------------------------
-- A photo names one of its own shop's designs. Deleting the design leaves the photo, plain: only design_option_id
-- is cleared, never tenant_id (PostgreSQL 15+'s column list).
DO $$ BEGIN
 ALTER TABLE "tenant"."product_images" ADD CONSTRAINT "product_images_design_fk" FOREIGN KEY ("tenant_id","design_option_id") REFERENCES "tenant"."attribute_options"("tenant_id","id") ON DELETE SET NULL ("design_option_id") ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- PD-13: a design belongs to one product and to the one photo-designs attribute; no other value belongs to a product.
CREATE FUNCTION tenant.check_design_option() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  designs boolean;
BEGIN
  SELECT a.photo_designs INTO designs FROM tenant.attributes a WHERE a.id = NEW.attribute_id;
  IF coalesce(designs, false) <> (NEW.product_id IS NOT NULL) THEN
    RAISE EXCEPTION 'a design belongs to one product, and only a design does'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'catalogue_design_product';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER attribute_options_design BEFORE INSERT OR UPDATE OF attribute_id, product_id
  ON tenant.attribute_options FOR EACH ROW EXECUTE FUNCTION tenant.check_design_option();
--> statement-breakpoint
-- PD-2: a photo shows a design of its own product, one that is still offered.
CREATE FUNCTION tenant.check_design_photo() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  owner uuid;
  retired timestamptz;
BEGIN
  IF NEW.design_option_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT o.product_id, o.retired_at INTO owner, retired
  FROM tenant.attribute_options o WHERE o.tenant_id = NEW.tenant_id AND o.id = NEW.design_option_id;
  IF owner IS DISTINCT FROM NEW.product_id OR retired IS NOT NULL THEN
    RAISE EXCEPTION 'a photo shows a design of its own product'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'catalogue_design_photo';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER product_images_design BEFORE INSERT OR UPDATE OF design_option_id, product_id
  ON tenant.product_images FOR EACH ROW EXECUTE FUNCTION tenant.check_design_photo();
--> statement-breakpoint
-- ATL-02, ATL-03 (ATR-14), as 0051 wrote it, plus PD-13: the photo-designs attribute only ever defines variants.
CREATE OR REPLACE FUNCTION tenant.check_product_attribute() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  kind tenant.attribute_data_type;
  designs boolean;
  splitting integer;
BEGIN
  SELECT a.data_type, a.photo_designs INTO kind, designs FROM tenant.attributes a WHERE a.id = NEW.attribute_id;
  IF designs AND NEW.role <> 'variant_defining' THEN
    RAISE EXCEPTION 'designs only ever define variants'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'catalogue_design_role';
  END IF;
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
-- ATL-04, as 0051 wrote it, plus PD-13: a variant's design is one of its own product's.
CREATE OR REPLACE FUNCTION tenant.check_variant_value() RETURNS trigger
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
  IF EXISTS (
    SELECT 1 FROM tenant.attribute_options o
    WHERE o.id = NEW.option_id AND o.product_id IS NOT NULL AND o.product_id <> NEW.product_id
  ) THEN
    RAISE EXCEPTION 'a variant''s design is one of its own product''s'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'catalogue_design_variant';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
-- PD-13: the one photo-designs attribute in the platform library. Its options are each product's own.
INSERT INTO tenant.attributes (tenant_id, name, data_type, unit_kind, photo_designs)
VALUES (NULL, 'Design', 'enum_single', NULL, true);
