-- ---------------------------------------------------------------------------------------------
-- DATABASE-SCHEMA §3.2 (inventory), Phase 3 Slice 5b: returns of shipped stock (INV-17). No new table: a return is
-- movements naming the reservation it shipped, as the shipment's sale does.
-- ---------------------------------------------------------------------------------------------

-- INV-15, INV-17, as migration 0062: a movement naming a reservation belongs to that shipped reservation, on the
-- variant that held it: its sale, never more than it held; a return received, never more than it shipped less what came
-- back; or the damaged write-off of returned units, never more than came back. The return and its write-off take
-- nothing free between them, so, like the sale, they go through while expiry has left the level short.
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
  returned numeric(14, 3);
  damaged numeric(14, 3);
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
    SELECT coalesce(-sum(m.quantity_delta) FILTER (WHERE m.reason = 'sale'), 0),
           coalesce(sum(m.quantity_delta) FILTER (WHERE m.reason = 'return_received'), 0),
           coalesce(-sum(m.quantity_delta) FILTER (WHERE m.reason = 'damaged'), 0)
      INTO shipped, returned, damaged
    FROM tenant.stock_movements m
    WHERE m.tenant_id = NEW.tenant_id AND m.reference_type = 'reservation' AND m.reference_id = NEW.reference_id;
    IF held_status IS DISTINCT FROM 'consumed' OR held_variant IS DISTINCT FROM NEW.variant_id OR NOT (
      (NEW.reason = 'sale' AND NEW.quantity_delta < 0 AND shipped - NEW.quantity_delta <= held_quantity)
      OR (NEW.reason = 'return_received' AND NEW.quantity_delta > 0 AND returned + NEW.quantity_delta <= shipped)
      OR (NEW.reason = 'damaged' AND NEW.quantity_delta < 0 AND damaged - NEW.quantity_delta <= returned)
    ) THEN
      RAISE EXCEPTION 'a reservation ships its units once, and takes back at most what it shipped'
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
-- INV-14, INV-17, as migration 0059: a serial whose unit left is history. A sold one changes only to record that its
-- unit came back (`returned`); the unit returns as a new in-stock row. A returned or written-off row never changes.
CREATE OR REPLACE FUNCTION tenant.guard_serial_number() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM tenant.product_variants v
      JOIN tenant.products p ON p.tenant_id = v.tenant_id AND p.id = v.product_id
      WHERE v.tenant_id = NEW.tenant_id AND v.id = NEW.variant_id AND p.serial_tracked
    ) THEN
      RAISE EXCEPTION 'serials are kept only for a serial-numbered product'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'serial_numbers_tracked';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'in_stock'
      OR NOT EXISTS (
        SELECT 1 FROM tenant.product_variants v WHERE v.tenant_id = OLD.tenant_id AND v.id = OLD.variant_id
      )
      OR (
        current_setting('app.erasing_tenant', true) = OLD.tenant_id::text
        AND EXISTS (
          SELECT 1 FROM control.tenants t WHERE t.id = OLD.tenant_id AND t.state IN ('archived', 'deleted')
        )
      ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'a serial whose unit has left is kept as history'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'serial_numbers_history';
  END IF;
  IF OLD.status IN ('written_off', 'returned')
     OR (OLD.status = 'sold' AND (
       NEW.status <> 'returned' OR NEW.left_movement_id IS DISTINCT FROM OLD.left_movement_id
       OR NEW.sold_order_id IS DISTINCT FROM OLD.sold_order_id
     ))
     OR (NEW.serial IS DISTINCT FROM OLD.serial AND OLD.status <> 'in_stock')
     OR NEW.variant_id IS DISTINCT FROM OLD.variant_id THEN
    RAISE EXCEPTION 'a serial whose unit has left is kept as history'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'serial_numbers_history';
  END IF;
  RETURN NEW;
END $$;
