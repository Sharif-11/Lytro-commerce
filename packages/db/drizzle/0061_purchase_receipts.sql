CREATE TABLE IF NOT EXISTS "tenant"."purchase_receipt_lines" (
	"tenant_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"purchase_line_id" uuid NOT NULL,
	"quantity_accepted" numeric(14, 3) NOT NULL,
	"quantity_rejected" numeric(14, 3) DEFAULT '0' NOT NULL,
	"reject_reason" varchar(200),
	"unit_cost" numeric(12, 4),
	"batch_id" uuid,
	"movement_id" bigint,
	CONSTRAINT "purchase_receipt_lines_tenant_id_receipt_id_purchase_line_id_pk" PRIMARY KEY("tenant_id","receipt_id","purchase_line_id"),
	CONSTRAINT "purchase_receipt_lines_accepted_check" CHECK ("tenant"."purchase_receipt_lines"."quantity_accepted" >= 0),
	CONSTRAINT "purchase_receipt_lines_rejected_check" CHECK ("tenant"."purchase_receipt_lines"."quantity_rejected" >= 0),
	CONSTRAINT "purchase_receipt_lines_some_check" CHECK ("tenant"."purchase_receipt_lines"."quantity_accepted" + "tenant"."purchase_receipt_lines"."quantity_rejected" > 0),
	CONSTRAINT "purchase_receipt_lines_reason_check" CHECK (("tenant"."purchase_receipt_lines"."quantity_rejected" > 0) = ("tenant"."purchase_receipt_lines"."reject_reason" IS NOT NULL)),
	CONSTRAINT "purchase_receipt_lines_movement_check" CHECK (("tenant"."purchase_receipt_lines"."quantity_accepted" > 0) = ("tenant"."purchase_receipt_lines"."movement_id" IS NOT NULL)),
	CONSTRAINT "purchase_receipt_lines_unit_cost_check" CHECK ("tenant"."purchase_receipt_lines"."unit_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."purchase_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"note" varchar(200),
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_receipts_tenant_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "tenant"."purchase_orders" ADD COLUMN "close_reason" varchar(200);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_receipt_fk" FOREIGN KEY ("tenant_id","receipt_id") REFERENCES "tenant"."purchase_receipts"("tenant_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_item_fk" FOREIGN KEY ("tenant_id","purchase_line_id") REFERENCES "tenant"."purchase_order_lines"("tenant_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."purchase_receipts" ADD CONSTRAINT "purchase_receipts_order_fk" FOREIGN KEY ("tenant_id","purchase_order_id") REFERENCES "tenant"."purchase_orders"("tenant_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_receipt_lines_item_idx" ON "tenant"."purchase_receipt_lines" USING btree ("tenant_id","purchase_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_receipts_order_idx" ON "tenant"."purchase_receipts" USING btree ("tenant_id","purchase_order_id");--> statement-breakpoint
ALTER TABLE "tenant"."purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_outstanding_check" CHECK ("tenant"."purchase_order_lines"."quantity_received" <= "tenant"."purchase_order_lines"."quantity_ordered");--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written security, triggers and grants (not expressible in Drizzle). Reviewed with the schema above.
-- DATABASE-SCHEMA §3.2 (purchasing), Phase 3 Slice 4b.
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['purchase_receipts', 'purchase_receipt_lines']
  LOOP
    EXECUTE format('ALTER TABLE tenant.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE tenant.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON tenant.%I USING (tenant_id = tenant.current_tenant_id()) '
      'WITH CHECK (tenant_id = tenant.current_tenant_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- PUR-04: a delivery is received only against a purchase placed with the supplier and still open.
CREATE FUNCTION tenant.check_purchase_receipt() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tenant.purchase_orders po
    WHERE po.tenant_id = NEW.tenant_id AND po.id = NEW.purchase_order_id
      AND po.status IN ('ordered', 'partially_received')
  ) THEN
    RAISE EXCEPTION 'a delivery is received only against a placed, open purchase'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'purchase_receipts_open';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER purchase_receipts_open BEFORE INSERT ON tenant.purchase_receipts
  FOR EACH ROW EXECUTE FUNCTION tenant.check_purchase_receipt();
--> statement-breakpoint
-- PUR-08: a receipt and its lines are never changed once saved, and deleted only with the rest of a lapsed shop's data
-- (LIF-19); a mistake is put right with a stock edit (INV-06).
CREATE FUNCTION tenant.keep_purchase_receipt() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
    AND current_setting('app.erasing_tenant', true) = OLD.tenant_id::text
    AND EXISTS (
      SELECT 1 FROM control.tenants t WHERE t.id = OLD.tenant_id AND t.state IN ('archived', 'deleted')
    ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'a saved receipt never changes; correct a mistake with a stock edit'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'purchase_receipts_final';
END $$;
--> statement-breakpoint
CREATE TRIGGER purchase_receipts_final BEFORE UPDATE OR DELETE ON tenant.purchase_receipts
  FOR EACH ROW EXECUTE FUNCTION tenant.keep_purchase_receipt();
--> statement-breakpoint
CREATE TRIGGER purchase_receipt_lines_final BEFORE UPDATE OR DELETE ON tenant.purchase_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION tenant.keep_purchase_receipt();
--> statement-breakpoint
-- PUR-04, UOM-03: one item's delivery, on the receipt's own purchase, in whole numbers unless the product is measured,
-- and never more, accepted and rejected together, than is still to come on the item. Under the item's lock, the
-- accepted units move its received quantity; rejected ones leave it outstanding.
CREATE FUNCTION tenant.apply_purchase_receipt_line() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ordered numeric(14, 3);
  received numeric(14, 3);
  unit tenant.stock_unit;
BEGIN
  SELECT pl.quantity_ordered, pl.quantity_received INTO ordered, received
  FROM tenant.purchase_order_lines pl
  JOIN tenant.purchase_receipts r ON r.tenant_id = pl.tenant_id AND r.purchase_order_id = pl.purchase_order_id
  WHERE pl.tenant_id = NEW.tenant_id AND pl.id = NEW.purchase_line_id AND r.id = NEW.receipt_id
  FOR UPDATE OF pl;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item % is not on this receipt''s purchase', NEW.purchase_line_id
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'purchase_receipt_lines_item';
  END IF;
  IF NEW.quantity_accepted + NEW.quantity_rejected > ordered - received THEN
    RAISE EXCEPTION 'a delivery brings at most what is still to come on an item'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'purchase_receipt_lines_outstanding';
  END IF;
  SELECT p.stock_unit INTO unit
  FROM tenant.purchase_order_lines pl
  JOIN tenant.products p ON p.tenant_id = pl.tenant_id AND p.id = pl.product_id
  WHERE pl.tenant_id = NEW.tenant_id AND pl.id = NEW.purchase_line_id;
  IF FOUND AND unit NOT IN ('kg', 'g', 'liter', 'ml') AND (
    NEW.quantity_accepted <> trunc(NEW.quantity_accepted) OR NEW.quantity_rejected <> trunc(NEW.quantity_rejected)
  ) THEN
    RAISE EXCEPTION 'stock counted in % is held in whole units', unit
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_whole_units';
  END IF;
  IF NEW.quantity_accepted > 0 THEN
    UPDATE tenant.purchase_order_lines SET quantity_received = quantity_received + NEW.quantity_accepted
    WHERE tenant_id = NEW.tenant_id AND id = NEW.purchase_line_id;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER purchase_receipt_lines_apply BEFORE INSERT ON tenant.purchase_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION tenant.apply_purchase_receipt_line();
--> statement-breakpoint
-- PUR-02, UOM-03, INV-24, as migration 0060, and PUR-04: what an item has received moves only with a receipt line (the
-- trigger above), so it always equals the units its receipts accepted; a new item has received nothing.
CREATE OR REPLACE FUNCTION tenant.check_purchase_line() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  owner_product uuid;
  unit tenant.stock_unit;
  pack numeric(14, 3);
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.quantity_received = 0
      OR (
        current_setting('app.erasing_tenant', true) = OLD.tenant_id::text
        AND EXISTS (
          SELECT 1 FROM control.tenants t WHERE t.id = OLD.tenant_id AND t.state IN ('archived', 'deleted')
        )
      ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'a purchase line with stock received on it is kept as history'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'purchase_lines_history';
  END IF;
  IF (TG_OP = 'INSERT' AND NEW.quantity_received <> 0)
     OR (TG_OP = 'UPDATE' AND NEW.quantity_received IS DISTINCT FROM OLD.quantity_received
         AND pg_trigger_depth() < 2) THEN
    RAISE EXCEPTION 'what an item has received moves only with a receipt'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'purchase_lines_received';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.variant_id IS DISTINCT FROM OLD.variant_id
    OR NEW.product_id IS DISTINCT FROM OLD.product_id
    OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
  ) THEN
    RAISE EXCEPTION 'a purchase line keeps its variant and its purchase'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'purchase_lines_history';
  END IF;
  SELECT v.product_id, p.stock_unit, v.pack_amount INTO owner_product, unit, pack
  FROM tenant.product_variants v
  JOIN tenant.products p ON p.tenant_id = v.tenant_id AND p.id = v.product_id
  WHERE v.tenant_id = NEW.tenant_id AND v.id = NEW.variant_id;
  IF NOT FOUND THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'variant % is not one of this shop''s', NEW.variant_id
        USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'purchase_lines_variant';
    END IF;
    RETURN NEW;
  END IF;
  IF owner_product IS DISTINCT FROM NEW.product_id THEN
    RAISE EXCEPTION 'variant % is not one of product %''s in this shop', NEW.variant_id, NEW.product_id
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'purchase_lines_variant';
  END IF;
  IF TG_OP = 'INSERT' AND pack IS NOT NULL THEN
    RAISE EXCEPTION 'a size drawing on a shared stock is bought by its shared stock'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'purchase_lines_shared';
  END IF;
  IF unit NOT IN ('kg', 'g', 'liter', 'ml') AND (
    NEW.quantity_ordered <> trunc(NEW.quantity_ordered) OR NEW.quantity_received <> trunc(NEW.quantity_received)
  ) THEN
    RAISE EXCEPTION 'stock counted in % is held in whole units', unit
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_whole_units';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
-- INV-03 to INV-05, UOM-03, INV-24, INV-12, INV-13, as migration 0058, and INV-10, PUR-04: a purchase-receipt movement
-- brings stock in, for a receipt it names. When it carries a unit cost, the variant's average cost takes it in, under
-- the level's lock, weighted by what was held before: (held x average + received x cost) / (held + received), to four
-- decimals, half up; with nothing held, or no cost known yet, the receipt's cost is the average. A receipt with no cost
-- leaves the average as it is.
CREATE OR REPLACE FUNCTION tenant.apply_stock_movement() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  owner_product uuid;
  holder boolean;
  shared boolean;
  batched boolean;
  unit tenant.stock_unit;
  current numeric(14, 3);
  batch_variant uuid;
  batch_closed timestamptz;
  expired numeric(14, 3);
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
  SELECT l.on_hand INTO current FROM tenant.stock_levels l
  WHERE l.tenant_id = NEW.tenant_id AND l.variant_id = NEW.variant_id
  FOR UPDATE;
  IF batched THEN
    SELECT b.variant_id, b.closed_at INTO batch_variant, batch_closed FROM tenant.stock_batches b
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
-- PUR-08: receipts are only ever inserted. DELETE is for LIF-19's day-60 deletion only, which the trigger above limits.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, DELETE ON tenant.purchase_receipts, tenant.purchase_receipt_lines TO lytronix_app;
  END IF;
END $$;
