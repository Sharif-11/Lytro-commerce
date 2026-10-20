CREATE TYPE "tenant"."reservation_status" AS ENUM('active', 'consumed', 'released');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."stock_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_line_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"sold_variant_id" uuid NOT NULL,
	"ordered" numeric(14, 3) NOT NULL,
	"pack_amount" numeric(14, 3),
	"quantity" numeric(14, 3) NOT NULL,
	"status" "tenant"."reservation_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "stock_reservations_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "stock_reservations_quantity_check" CHECK ("tenant"."stock_reservations"."quantity" > 0),
	CONSTRAINT "stock_reservations_ordered_check" CHECK ("tenant"."stock_reservations"."ordered" > 0),
	CONSTRAINT "stock_reservations_pack_check" CHECK ("tenant"."stock_reservations"."pack_amount" > 0),
	CONSTRAINT "stock_reservations_resolved_check" CHECK (("tenant"."stock_reservations"."status" = 'active') = ("tenant"."stock_reservations"."resolved_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "tenant"."stock_levels" DROP CONSTRAINT "stock_levels_available_check";--> statement-breakpoint
ALTER TABLE "tenant"."stock_levels" drop column "available";--> statement-breakpoint
ALTER TABLE "tenant"."stock_levels" ADD COLUMN "available" numeric(14, 3) GENERATED ALWAYS AS (GREATEST("on_hand" - "reserved" - "unsellable", 0)) STORED;--> statement-breakpoint
ALTER TABLE "tenant"."stock_levels" ADD COLUMN "short_notified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stock_reservations_line_idx" ON "tenant"."stock_reservations" USING btree ("tenant_id","order_line_id","sold_variant_id") WHERE "tenant"."stock_reservations"."status" = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_reservations_variant_idx" ON "tenant"."stock_reservations" USING btree ("tenant_id","variant_id") WHERE "tenant"."stock_reservations"."status" = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_reservations_expiry_idx" ON "tenant"."stock_reservations" USING btree ("tenant_id","expires_at") WHERE "tenant"."stock_reservations"."status" = 'active' AND "tenant"."stock_reservations"."expires_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_reservations_order_idx" ON "tenant"."stock_reservations" USING btree ("tenant_id","order_id");--> statement-breakpoint
ALTER TABLE "tenant"."stock_levels" ADD CONSTRAINT "stock_levels_reserved_held_check" CHECK ("tenant"."stock_levels"."reserved" <= "tenant"."stock_levels"."on_hand");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_movements_reference_idx" ON "tenant"."stock_movements" USING btree ("tenant_id","reference_type","reference_id") WHERE "tenant"."stock_movements"."reference_id" IS NOT NULL;--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written security, triggers, grants and seed data (not expressible in Drizzle). Reviewed with the schema above.
-- DATABASE-SCHEMA §3.2 (inventory), Phase 3 Slice 5a.
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
ALTER TABLE tenant.stock_reservations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.stock_reservations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.stock_reservations
  USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
-- INV-03, INV-05, as migration 0054, and INV-15: a level's on-hand stock changes only through a stock movement, and its
-- reserved stock only through a reservation (both by their triggers, so reserved always equals the active reservations).
CREATE OR REPLACE FUNCTION tenant.guard_stock_level() RETURNS trigger
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
  IF (TG_OP = 'INSERT' AND NEW.reserved <> 0)
     OR (TG_OP = 'UPDATE' AND NEW.reserved IS DISTINCT FROM OLD.reserved) THEN
    RAISE EXCEPTION 'reserved stock changes only through a reservation'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_levels_through_reservations';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
-- INV-01, as migration 0061, and INV-15: a movement taking stock that is free to sell may never take it below zero, so
-- it never takes units held for orders. Two take nothing free, and so go through while expiry has left held units
-- short (INV-13): expired stock leaving (a write-off), as long as what stays on hand still covers what is held; and a
-- reservation shipping, a sale naming the reservation it ships, which takes the units held for it and never more.
CREATE OR REPLACE FUNCTION tenant.apply_stock_movement() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  owner_product uuid;
  holder boolean;
  shared boolean;
  batched boolean;
  unit tenant.stock_unit;
  current numeric(14, 3);
  held numeric(14, 3);
  batch_variant uuid;
  batch_closed timestamptz;
  batch_expires date;
  expired numeric(14, 3);
  held_variant uuid;
  held_quantity numeric(14, 3);
  held_status tenant.reservation_status;
  shipped numeric(14, 3);
BEGIN
  SELECT v.product_id, v.is_stock_holder, p.shared_stock, p.batch_tracked, p.stock_unit
    INTO owner_product, holder, shared, batched, unit
  FROM tenant.product_variants v
  JOIN tenant.products p ON p.tenant_id = v.tenant_id AND p.id = v.product_id
  WHERE v.tenant_id = NEW.tenant_id AND v.id = NEW.variant_id
  FOR SHARE OF p;
  IF NOT FOUND OR owner_product IS DISTINCT FROM NEW.product_id THEN
    RAISE EXCEPTION 'variant % is not one of product %''s in this shop', NEW.variant_id, NEW.product_id
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'stock_movements_variant';
  END IF;
  IF holder IS DISTINCT FROM shared THEN
    RAISE EXCEPTION 'a product sharing its stock holds it on its stock holder only'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_shared_on_holder';
  END IF;
  IF batched IS DISTINCT FROM (NEW.batch_id IS NOT NULL) THEN
    RAISE EXCEPTION 'a movement names a batch exactly when its product is batch-tracked'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_movements_batch';
  END IF;
  IF unit NOT IN ('kg', 'g', 'liter', 'ml') AND NEW.quantity_delta <> trunc(NEW.quantity_delta) THEN
    RAISE EXCEPTION 'stock counted in % is held in whole units', unit
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_whole_units';
  END IF;
  IF NEW.reason = 'purchase_receipt' AND (
    NEW.quantity_delta <= 0 OR NEW.reference_type IS DISTINCT FROM 'purchase_receipt' OR NEW.reference_id IS NULL
  ) THEN
    RAISE EXCEPTION 'a purchase receipt brings stock in, for the receipt it names'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_movements_receipt';
  END IF;
  INSERT INTO tenant.stock_levels (tenant_id, variant_id) VALUES (NEW.tenant_id, NEW.variant_id)
    ON CONFLICT (tenant_id, variant_id) DO NOTHING;
  IF NEW.reference_type = 'reservation' THEN
    SELECT r.variant_id, r.quantity, r.status INTO held_variant, held_quantity, held_status
    FROM tenant.stock_reservations r
    WHERE r.tenant_id = NEW.tenant_id AND r.id = NEW.reference_id;
    SELECT coalesce(-sum(m.quantity_delta), 0) INTO shipped FROM tenant.stock_movements m
    WHERE m.tenant_id = NEW.tenant_id AND m.reference_type = 'reservation' AND m.reference_id = NEW.reference_id;
    IF NEW.reason <> 'sale' OR NEW.quantity_delta > 0 OR held_status IS DISTINCT FROM 'consumed'
       OR held_variant IS DISTINCT FROM NEW.variant_id OR shipped - NEW.quantity_delta > held_quantity THEN
      RAISE EXCEPTION 'a reservation ships as a sale of the units it held, once'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_movements_reservation';
    END IF;
  END IF;
  SELECT l.on_hand, l.reserved INTO current, held FROM tenant.stock_levels l
  WHERE l.tenant_id = NEW.tenant_id AND l.variant_id = NEW.variant_id
  FOR UPDATE;
  IF batched THEN
    SELECT b.variant_id, b.closed_at, b.expires_on INTO batch_variant, batch_closed, batch_expires
    FROM tenant.stock_batches b
    WHERE b.tenant_id = NEW.tenant_id AND b.id = NEW.batch_id
    FOR UPDATE;
    IF NOT FOUND OR batch_variant IS DISTINCT FROM NEW.variant_id OR batch_closed IS NOT NULL THEN
      RAISE EXCEPTION 'batch % is not an open batch of variant %', NEW.batch_id, NEW.variant_id
        USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_movements_batch';
    END IF;
    UPDATE tenant.stock_batches SET quantity = quantity + NEW.quantity_delta
    WHERE tenant_id = NEW.tenant_id AND id = NEW.batch_id;
  END IF;
  NEW.on_hand_after := current + NEW.quantity_delta;
  SELECT coalesce(sum(b.quantity), 0) INTO expired FROM tenant.stock_batches b
  WHERE b.tenant_id = NEW.tenant_id AND b.variant_id = NEW.variant_id AND b.closed_at IS NULL
    AND b.expires_on < tenant.dhaka_today();
  IF NEW.quantity_delta < 0 AND NEW.on_hand_after - held - expired < 0
     AND (batch_expires IS NULL OR batch_expires >= tenant.dhaka_today())
     AND NEW.reference_type IS DISTINCT FROM 'reservation' THEN
    RAISE EXCEPTION 'not enough stock is free for this change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_levels_available_check';
  END IF;
  UPDATE tenant.stock_levels SET on_hand = NEW.on_hand_after, unsellable = expired, updated_at = now()
  WHERE tenant_id = NEW.tenant_id AND variant_id = NEW.variant_id;
  IF NEW.reason = 'purchase_receipt' AND NEW.unit_cost IS NOT NULL THEN
    UPDATE tenant.product_variants
    SET avg_cost = CASE
      WHEN avg_cost IS NULL OR current <= 0 THEN NEW.unit_cost
      ELSE round((current * avg_cost + NEW.quantity_delta * NEW.unit_cost) / (current + NEW.quantity_delta), 4)
    END
    WHERE tenant_id = NEW.tenant_id AND id = NEW.variant_id;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
-- INV-15, INV-24, UOM-03: stock held for an order line. A new reservation holds stock of a tracked product, on the
-- live variant that holds it (the product's shared stock when it shares) for a live variant of the same product, never
-- more than is free (expired stock is not), in whole units unless the product is measured, and raises the level's
-- reserved stock. It locks as a stock movement does -- the product shared, then the level -- and then shares both
-- variants, so a product turning made to order or a variant being retired (keep_held_variants) either waits for it
-- or is seen by it. It is resolved once, shipped or let go, and then only its status and resolution time change,
-- lowering the reserved stock again. It is deleted only with the rest of a lapsed shop's data (LIF-19).
CREATE FUNCTION tenant.apply_stock_reservation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  owner_product uuid;
  holder boolean;
  shared boolean;
  tracking text;
  unit tenant.stock_unit;
  live integer;
  current numeric(14, 3);
  held numeric(14, 3);
  expired numeric(14, 3);
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('app.erasing_tenant', true) = OLD.tenant_id::text
       AND EXISTS (
         SELECT 1 FROM control.tenants t WHERE t.id = OLD.tenant_id AND t.state IN ('archived', 'deleted')
       ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'a reservation is kept as history; release it instead'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_reservations_kept';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'active' THEN
      RAISE EXCEPTION 'a reservation starts out holding its stock'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_reservations_kept';
    END IF;
    SELECT v.product_id, v.is_stock_holder INTO owner_product, holder FROM tenant.product_variants v
    WHERE v.tenant_id = NEW.tenant_id AND v.id = NEW.variant_id;
    IF NOT FOUND OR owner_product IS DISTINCT FROM NEW.product_id THEN
      RAISE EXCEPTION 'variant % is not one of product %''s in this shop', NEW.variant_id, NEW.product_id
        USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'stock_reservations_variant';
    END IF;
    SELECT p.shared_stock, p.stock_tracking::text, p.stock_unit INTO shared, tracking, unit FROM tenant.products p
    WHERE p.tenant_id = NEW.tenant_id AND p.id = NEW.product_id
    FOR SHARE;
    IF NOT FOUND OR holder IS DISTINCT FROM shared OR tracking <> 'tracked' THEN
      RAISE EXCEPTION 'variant % does not hold stock of product % in this shop', NEW.variant_id, NEW.product_id
        USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'stock_reservations_variant';
    END IF;
    IF unit NOT IN ('kg', 'g', 'liter', 'ml') AND NEW.quantity <> trunc(NEW.quantity) THEN
      RAISE EXCEPTION 'stock counted in % is held in whole units', unit
        USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_whole_units';
    END IF;
    INSERT INTO tenant.stock_levels (tenant_id, variant_id) VALUES (NEW.tenant_id, NEW.variant_id)
      ON CONFLICT (tenant_id, variant_id) DO NOTHING;
    SELECT l.on_hand, l.reserved INTO current, held FROM tenant.stock_levels l
    WHERE l.tenant_id = NEW.tenant_id AND l.variant_id = NEW.variant_id
    FOR UPDATE;
    PERFORM 1 FROM tenant.product_variants v
    WHERE v.tenant_id = NEW.tenant_id AND v.id IN (NEW.variant_id, NEW.sold_variant_id)
      AND v.product_id = NEW.product_id AND v.deleted_at IS NULL
    FOR SHARE;
    GET DIAGNOSTICS live = ROW_COUNT;
    IF live <> 1 + (NEW.variant_id <> NEW.sold_variant_id)::integer THEN
      RAISE EXCEPTION 'variant % is not a live variant of product % in this shop', NEW.sold_variant_id, NEW.product_id
        USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'stock_reservations_variant';
    END IF;
    SELECT coalesce(sum(b.quantity), 0) INTO expired FROM tenant.stock_batches b
    WHERE b.tenant_id = NEW.tenant_id AND b.variant_id = NEW.variant_id AND b.closed_at IS NULL
      AND b.expires_on < tenant.dhaka_today();
    IF current - held - expired < NEW.quantity THEN
      RAISE EXCEPTION 'not enough stock is free to hold for this order'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_levels_available_check';
    END IF;
    UPDATE tenant.stock_levels SET reserved = reserved + NEW.quantity, unsellable = expired, updated_at = now()
    WHERE tenant_id = NEW.tenant_id AND variant_id = NEW.variant_id;
    RETURN NEW;
  END IF;
  IF OLD.status <> 'active' OR NEW.status = 'active'
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.order_line_id IS DISTINCT FROM OLD.order_line_id OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.variant_id IS DISTINCT FROM OLD.variant_id OR NEW.sold_variant_id IS DISTINCT FROM OLD.sold_variant_id
     OR NEW.ordered IS DISTINCT FROM OLD.ordered OR NEW.pack_amount IS DISTINCT FROM OLD.pack_amount
     OR NEW.quantity IS DISTINCT FROM OLD.quantity OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'a reservation is resolved once, and then kept as it was'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_reservations_kept';
  END IF;
  PERFORM 1 FROM tenant.stock_levels l
  WHERE l.tenant_id = OLD.tenant_id AND l.variant_id = OLD.variant_id
  FOR UPDATE;
  UPDATE tenant.stock_levels SET reserved = reserved - OLD.quantity, updated_at = now()
  WHERE tenant_id = OLD.tenant_id AND variant_id = OLD.variant_id;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER stock_reservations_apply BEFORE INSERT OR UPDATE OR DELETE ON tenant.stock_reservations
  FOR EACH ROW EXECUTE FUNCTION tenant.apply_stock_reservation();
--> statement-breakpoint
-- INV-15: a reservation marked shipped has shipped, as sales naming it, exactly the units it held. Checked when the
-- transaction commits, so marking it and recording its sale are judged together.
CREATE FUNCTION tenant.check_reservation_shipped() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  shipped numeric(14, 3);
BEGIN
  SELECT coalesce(-sum(m.quantity_delta), 0) INTO shipped FROM tenant.stock_movements m
  WHERE m.tenant_id = NEW.tenant_id AND m.reference_type = 'reservation' AND m.reference_id = NEW.id;
  IF shipped <> NEW.quantity THEN
    RAISE EXCEPTION 'reservation % held % and shipped %', NEW.id, NEW.quantity, shipped
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_reservations_shipped';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stock_reservations_shipped AFTER UPDATE OF status ON tenant.stock_reservations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.status = 'consumed')
  EXECUTE FUNCTION tenant.check_reservation_shipped();
--> statement-breakpoint
-- INV-15, PRD-13: while units are held for an order line, the variant holding them or the one ordered is not retired
-- or deleted for good, and the product does not turn made to order; the order is shipped or let go first. The day-60
-- deletion removes the reservations before the catalogue, so it never meets one.
CREATE FUNCTION tenant.keep_held_variants() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'products' THEN
    IF NEW.stock_tracking::text = 'not_tracked' AND OLD.stock_tracking::text = 'tracked' AND EXISTS (
      SELECT 1 FROM tenant.stock_reservations r
      WHERE r.tenant_id = NEW.tenant_id AND r.product_id = NEW.id AND r.status = 'active'
    ) THEN
      RAISE EXCEPTION 'units of this product are held for orders'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_held_for_orders';
    END IF;
    RETURN NEW;
  END IF;
  IF (TG_OP = 'DELETE' OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)) AND EXISTS (
    SELECT 1 FROM tenant.stock_reservations r
    WHERE r.tenant_id = OLD.tenant_id AND r.status = 'active'
      AND (r.variant_id = OLD.id OR r.sold_variant_id = OLD.id)
  ) THEN
    RAISE EXCEPTION 'units of this variant are held for orders'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_held_for_orders';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
--> statement-breakpoint
CREATE TRIGGER product_variants_held BEFORE UPDATE OF deleted_at OR DELETE ON tenant.product_variants
  FOR EACH ROW EXECUTE FUNCTION tenant.keep_held_variants();
--> statement-breakpoint
CREATE TRIGGER products_held BEFORE UPDATE OF stock_tracking ON tenant.products
  FOR EACH ROW EXECUTE FUNCTION tenant.keep_held_variants();
--> statement-breakpoint
-- The application role writes reservations; the triggers above limit an update to resolving one, and a delete to
-- LIF-19's day-60 deletion.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.stock_reservations TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- INV-16, D3-6: how long an order awaiting online payment holds its stock; Phase 5 sets it from the payment session.
INSERT INTO control.platform_settings (key, value, description) VALUES
  ('reservation_expiry_minutes', '30', 'How many minutes an order awaiting online payment holds its stock (INV-16).')
ON CONFLICT (key) DO NOTHING;
