CREATE TYPE "tenant"."stock_reason" AS ENUM('initial', 'purchase_receipt', 'sale', 'return_received', 'damaged', 'lost', 'expired', 'recount', 'manual_adjustment');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."stock_levels" (
	"tenant_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"on_hand" numeric(14, 3) DEFAULT '0' NOT NULL,
	"reserved" numeric(14, 3) DEFAULT '0' NOT NULL,
	"unsellable" numeric(14, 3) DEFAULT '0' NOT NULL,
	"available" numeric(14, 3) GENERATED ALWAYS AS ("on_hand" - "reserved" - "unsellable") STORED,
	"low_notified" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_levels_pkey" PRIMARY KEY("tenant_id","variant_id"),
	CONSTRAINT "stock_levels_on_hand_check" CHECK ("tenant"."stock_levels"."on_hand" >= 0),
	CONSTRAINT "stock_levels_reserved_check" CHECK ("tenant"."stock_levels"."reserved" >= 0),
	CONSTRAINT "stock_levels_unsellable_check" CHECK ("tenant"."stock_levels"."unsellable" >= 0),
	CONSTRAINT "stock_levels_available_check" CHECK ("tenant"."stock_levels"."on_hand" - "tenant"."stock_levels"."reserved" - "tenant"."stock_levels"."unsellable" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."stock_movements" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity_delta" numeric(14, 3) NOT NULL,
	"on_hand_after" numeric(14, 3) DEFAULT '0' NOT NULL,
	"reason" "tenant"."stock_reason" NOT NULL,
	"unit_cost" numeric(12, 4),
	"reference_type" text,
	"reference_id" uuid,
	"actor_user_id" uuid,
	"note" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_delta_check" CHECK ("tenant"."stock_movements"."quantity_delta" <> 0),
	CONSTRAINT "stock_movements_on_hand_after_check" CHECK ("tenant"."stock_movements"."on_hand_after" >= 0),
	CONSTRAINT "stock_movements_unit_cost_check" CHECK ("tenant"."stock_movements"."unit_cost" >= 0)
);
--> statement-breakpoint
ALTER TABLE "tenant"."product_variants" ADD COLUMN "avg_cost" numeric(12, 4);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."stock_levels" ADD CONSTRAINT "stock_levels_variant_fk" FOREIGN KEY ("tenant_id","variant_id") REFERENCES "tenant"."product_variants"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_variant_idx" ON "tenant"."stock_movements" USING btree ("tenant_id","variant_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_tenant_created_idx" ON "tenant"."stock_movements" USING btree ("tenant_id","created_at");--> statement-breakpoint
ALTER TABLE "tenant"."product_variants" ADD CONSTRAINT "product_variants_avg_cost_check" CHECK ("tenant"."product_variants"."avg_cost" >= 0);
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written security, triggers and grants (not expressible in Drizzle). Reviewed with the schema above.
-- DATABASE-SCHEMA §3.2 (inventory), Phase 3 Slice 2a.
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_levels', 'stock_movements']
  LOOP
    EXECUTE format('ALTER TABLE tenant.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE tenant.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON tenant.%I USING (tenant_id = tenant.current_tenant_id()) '
      'WITH CHECK (tenant_id = tenant.current_tenant_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- INV-03, INV-05, UOM-03: a movement is the only way on-hand stock changes. Before it is stored, this checks the
-- variant is the named product's and the shop's own, refuses a fraction for a product counted in whole units, makes
-- the variant's level if it has none, locks it (so concurrent movements on one variant apply one after the other),
-- fills in on_hand_after, and moves the level to it. A level's own checks refuse stock below zero, and available
-- stock below zero, so overselling fails here whatever the caller did. Runs as the caller, under its row-level
-- security.
CREATE FUNCTION tenant.apply_stock_movement() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  owner_product uuid;
  unit tenant.stock_unit;
  current numeric(14, 3);
BEGIN
  SELECT v.product_id, p.stock_unit INTO owner_product, unit
  FROM tenant.product_variants v
  JOIN tenant.products p ON p.tenant_id = v.tenant_id AND p.id = v.product_id
  WHERE v.tenant_id = NEW.tenant_id AND v.id = NEW.variant_id;
  IF NOT FOUND OR owner_product IS DISTINCT FROM NEW.product_id THEN
    RAISE EXCEPTION 'variant % is not one of product %''s in this shop', NEW.variant_id, NEW.product_id
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'stock_movements_variant';
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
CREATE TRIGGER stock_movements_apply BEFORE INSERT ON tenant.stock_movements
  FOR EACH ROW EXECUTE FUNCTION tenant.apply_stock_movement();
--> statement-breakpoint
-- INV-06: a level's on-hand quantity never changes except through a movement. Only the movement trigger's own write
-- (one trigger level deeper) may set it; a level is otherwise made empty and keeps its quantity.
CREATE FUNCTION tenant.guard_stock_level() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'INSERT' AND NEW.on_hand <> 0)
     OR (TG_OP = 'UPDATE' AND NEW.on_hand IS DISTINCT FROM OLD.on_hand) THEN
    RAISE EXCEPTION 'on-hand stock changes only through a stock movement'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_levels_through_movements';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER stock_levels_guard BEFORE INSERT OR UPDATE ON tenant.stock_levels
  FOR EACH ROW EXECUTE FUNCTION tenant.guard_stock_level();
--> statement-breakpoint
-- INV-03: movements are never changed, by any role. The one deletion is LIF-19's day-60 removal of a lapsed shop's
-- business data, which must name the shop in this transaction (app.erasing_tenant) and only works while the shop is
-- archived or already deleted, so no live shop's ledger can be removed.
CREATE FUNCTION tenant.guard_stock_movement() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('app.erasing_tenant', true) = OLD.tenant_id::text
     AND EXISTS (
       SELECT 1 FROM control.tenants t WHERE t.id = OLD.tenant_id AND t.state IN ('archived', 'deleted')
     ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'tenant.stock_movements is append-only'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_movements_append_only';
END $$;
--> statement-breakpoint
CREATE TRIGGER stock_movements_append_only BEFORE UPDATE OR DELETE ON tenant.stock_movements
  FOR EACH ROW EXECUTE FUNCTION tenant.guard_stock_movement();
--> statement-breakpoint
-- UOM-03: a product holding a fraction of stock cannot move to a unit counted in whole numbers.
CREATE FUNCTION tenant.keep_whole_stock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stock_unit NOT IN ('kg', 'g', 'liter', 'ml') AND EXISTS (
    SELECT 1 FROM tenant.stock_levels l
    JOIN tenant.product_variants v ON v.tenant_id = l.tenant_id AND v.id = l.variant_id
    WHERE v.tenant_id = NEW.tenant_id AND v.product_id = NEW.id AND l.on_hand <> trunc(l.on_hand)
  ) THEN
    RAISE EXCEPTION 'this product holds a fraction of stock, so it cannot be counted in %', NEW.stock_unit
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_whole_units';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER products_whole_stock BEFORE UPDATE OF stock_unit ON tenant.products
  FOR EACH ROW WHEN (NEW.stock_unit IS DISTINCT FROM OLD.stock_unit)
  EXECUTE FUNCTION tenant.keep_whole_stock();
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.stock_levels TO lytronix_app;
    -- No UPDATE: a movement is never changed. DELETE is refused by the trigger above except for LIF-19.
    GRANT SELECT, INSERT, DELETE ON tenant.stock_movements TO lytronix_app;
    GRANT USAGE, SELECT ON SEQUENCE tenant.stock_movements_id_seq TO lytronix_app;
  END IF;
END $$;
