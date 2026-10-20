ALTER TABLE "tenant"."product_variants" ADD COLUMN "pack_amount" numeric(14, 3);--> statement-breakpoint
ALTER TABLE "tenant"."product_variants" ADD COLUMN "is_stock_holder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant"."products" ADD COLUMN "shared_stock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant"."product_variants" ADD CONSTRAINT "product_variants_pack_amount_check" CHECK ("tenant"."product_variants"."pack_amount" > 0);--> statement-breakpoint
ALTER TABLE "tenant"."product_variants" ADD CONSTRAINT "product_variants_stock_holder_check" CHECK (NOT "tenant"."product_variants"."is_stock_holder" OR ("tenant"."product_variants"."combination_key" = '#stock' AND "tenant"."product_variants"."pack_amount" IS NULL));--> statement-breakpoint
ALTER TABLE "tenant"."products" ADD CONSTRAINT "products_shared_stock_check" CHECK (NOT ("tenant"."products"."shared_stock" AND ("tenant"."products"."stock_tracking" = 'not_tracked' OR "tenant"."products"."serial_tracked")));--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written triggers (not expressible in Drizzle). Reviewed with the schema above.
-- DATABASE-SCHEMA §3.2 (catalogue, inventory), Phase 3 Slice 2b: shared stock (INV-24).
-- ---------------------------------------------------------------------------------------------

-- ATL-03 (ATR-14): at most 100 live variants per product, counting a retired one brought back. A product's stock
-- holder (INV-24) is not one of them, and is never limited.
CREATE OR REPLACE FUNCTION tenant.check_variant_limit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  live integer;
BEGIN
  IF NEW.is_stock_holder OR NEW.deleted_at IS NOT NULL OR (TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL) THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM tenant.products p WHERE p.tenant_id = NEW.tenant_id AND p.id = NEW.product_id FOR UPDATE;
  SELECT count(*) INTO live FROM tenant.product_variants v
  WHERE v.tenant_id = NEW.tenant_id AND v.product_id = NEW.product_id AND v.deleted_at IS NULL
    AND NOT v.is_stock_holder AND v.id <> NEW.id;
  IF live >= 100 THEN
    RAISE EXCEPTION 'a product has at most 100 variants'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'catalogue_variant_limit';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
-- INV-03, INV-05, UOM-03, as migration 0054, and INV-24: a product that shares its stock holds it on its stock holder
-- alone, so a movement on any other of its variants is refused, as is one on a holder whose product no longer shares.
CREATE OR REPLACE FUNCTION tenant.apply_stock_movement() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  owner_product uuid;
  holder boolean;
  shared boolean;
  unit tenant.stock_unit;
  current numeric(14, 3);
BEGIN
  SELECT v.product_id, v.is_stock_holder, p.shared_stock, p.stock_unit INTO owner_product, holder, shared, unit
  FROM tenant.product_variants v
  JOIN tenant.products p ON p.tenant_id = v.tenant_id AND p.id = v.product_id
  WHERE v.tenant_id = NEW.tenant_id AND v.id = NEW.variant_id;
  IF NOT FOUND OR owner_product IS DISTINCT FROM NEW.product_id THEN
    RAISE EXCEPTION 'variant % is not one of product %''s in this shop', NEW.variant_id, NEW.product_id
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'stock_movements_variant';
  END IF;
  IF holder IS DISTINCT FROM shared THEN
    RAISE EXCEPTION 'a product sharing its stock holds it on its stock holder only'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_shared_on_holder';
  END IF;
  IF unit NOT IN ('kg', 'g', 'liter', 'ml') AND NEW.quantity_delta <> trunc(NEW.quantity_delta) THEN
    RAISE EXCEPTION 'stock counted in % is held in whole units', unit
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_whole_units';
  END IF;
  INSERT INTO tenant.stock_levels (tenant_id, variant_id) VALUES (NEW.tenant_id, NEW.variant_id)
    ON CONFLICT (tenant_id, variant_id) DO NOTHING;
  SELECT l.on_hand INTO current FROM tenant.stock_levels l
  WHERE l.tenant_id = NEW.tenant_id AND l.variant_id = NEW.variant_id
  FOR UPDATE;
  NEW.on_hand_after := current + NEW.quantity_delta;
  UPDATE tenant.stock_levels SET on_hand = NEW.on_hand_after, updated_at = now()
  WHERE tenant_id = NEW.tenant_id AND variant_id = NEW.variant_id;
  RETURN NEW;
END $$;
--> statement-breakpoint
-- UOM-03, INV-24: a pack of a product counted in whole units is a whole number too (a box of 12 pens, never 1.5).
CREATE FUNCTION tenant.keep_whole_pack() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.pack_amount IS NOT NULL AND NEW.pack_amount <> trunc(NEW.pack_amount) AND EXISTS (
    SELECT 1 FROM tenant.products p
    WHERE p.tenant_id = NEW.tenant_id AND p.id = NEW.product_id AND p.stock_unit NOT IN ('kg', 'g', 'liter', 'ml')
  ) THEN
    RAISE EXCEPTION 'a pack of a product counted in whole units is a whole number'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_whole_units';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER product_variants_whole_pack BEFORE INSERT OR UPDATE OF pack_amount ON tenant.product_variants
  FOR EACH ROW EXECUTE FUNCTION tenant.keep_whole_pack();
--> statement-breakpoint
-- UOM-03, as migration 0054, and INV-24: nor may it move to a whole-number unit while one of its packs is a fraction.
CREATE OR REPLACE FUNCTION tenant.keep_whole_stock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stock_unit NOT IN ('kg', 'g', 'liter', 'ml') AND (
    EXISTS (
      SELECT 1 FROM tenant.stock_levels l
      JOIN tenant.product_variants v ON v.tenant_id = l.tenant_id AND v.id = l.variant_id
      WHERE v.tenant_id = NEW.tenant_id AND v.product_id = NEW.id AND l.on_hand <> trunc(l.on_hand)
    ) OR EXISTS (
      SELECT 1 FROM tenant.product_variants v
      WHERE v.tenant_id = NEW.tenant_id AND v.product_id = NEW.id AND v.pack_amount <> trunc(v.pack_amount)
    )
  ) THEN
    RAISE EXCEPTION 'this product holds a fraction of stock, so it cannot be counted in %', NEW.stock_unit
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_whole_units';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
-- INV-24: a product switches to or from shared stock only while it holds nothing: no variant of it, stock holder
-- included, has stock on hand or held for an order. The stock is never converted between the two.
CREATE FUNCTION tenant.keep_shared_switch_empty() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM tenant.stock_levels l
    JOIN tenant.product_variants v ON v.tenant_id = l.tenant_id AND v.id = l.variant_id
    WHERE v.tenant_id = NEW.tenant_id AND v.product_id = NEW.id AND (l.on_hand <> 0 OR l.reserved <> 0)
  ) THEN
    RAISE EXCEPTION 'a product switches to or from shared stock only while it holds none'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'shared_stock_switch_needs_empty';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER products_shared_switch_empty BEFORE UPDATE OF shared_stock ON tenant.products
  FOR EACH ROW WHEN (NEW.shared_stock IS DISTINCT FROM OLD.shared_stock)
  EXECUTE FUNCTION tenant.keep_shared_switch_empty();
