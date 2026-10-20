CREATE TABLE IF NOT EXISTS "tenant"."stock_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"batch_code" varchar(40),
	"expires_on" date,
	"is_default" boolean DEFAULT false NOT NULL,
	"opening_quantity" numeric(14, 3) DEFAULT '0' NOT NULL,
	"quantity" numeric(14, 3) DEFAULT '0' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expiry_notified_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "stock_batches_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "stock_batches_quantity_check" CHECK ("tenant"."stock_batches"."quantity" >= 0),
	CONSTRAINT "stock_batches_opening_quantity_check" CHECK ("tenant"."stock_batches"."opening_quantity" >= 0),
	CONSTRAINT "stock_batches_default_check" CHECK (NOT "tenant"."stock_batches"."is_default" OR ("tenant"."stock_batches"."batch_code" IS NULL AND "tenant"."stock_batches"."expires_on" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "tenant"."stock_check_lines" DROP CONSTRAINT "stock_check_lines_tenant_id_check_id_variant_id_pk";--> statement-breakpoint
ALTER TABLE "tenant"."stock_check_lines" ADD COLUMN "id" bigserial PRIMARY KEY NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant"."stock_check_lines" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "tenant"."stock_movements" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."stock_batches" ADD CONSTRAINT "stock_batches_variant_fk" FOREIGN KEY ("tenant_id","variant_id") REFERENCES "tenant"."product_variants"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stock_batches_default_idx" ON "tenant"."stock_batches" USING btree ("tenant_id","variant_id") WHERE "tenant"."stock_batches"."is_default" AND "tenant"."stock_batches"."closed_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stock_batches_code_idx" ON "tenant"."stock_batches" USING btree ("tenant_id","variant_id","batch_code") WHERE "tenant"."stock_batches"."batch_code" IS NOT NULL AND "tenant"."stock_batches"."closed_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_batches_pick_idx" ON "tenant"."stock_batches" USING btree ("tenant_id","variant_id","expires_on","received_at") WHERE "tenant"."stock_batches"."closed_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_batches_expiry_idx" ON "tenant"."stock_batches" USING btree ("tenant_id","expires_on") WHERE "tenant"."stock_batches"."closed_at" IS NULL AND "tenant"."stock_batches"."expires_on" IS NOT NULL;--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written security, triggers and grants (not expressible in Drizzle). Reviewed with the schema above.
-- DATABASE-SCHEMA §3.2 (inventory), Phase 3 Slice 3a: batches and expiry (INV-12, INV-13).
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
ALTER TABLE tenant.stock_batches ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.stock_batches FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.stock_batches
  USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
-- INV-07, INV-12: a check counts a variant once, as a whole or batch by batch.
CREATE UNIQUE INDEX stock_check_lines_counted_once_idx ON tenant.stock_check_lines
  (tenant_id, check_id, variant_id, coalesce(batch_id, '00000000-0000-0000-0000-000000000000'::uuid));
--> statement-breakpoint
-- INV-13: today in Asia/Dhaka, the day a batch's expiry date is measured against (its last sellable day).
CREATE FUNCTION tenant.dhaka_today() RETURNS date
LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Asia/Dhaka')::date $$;
--> statement-breakpoint
-- INV-03, INV-05, UOM-03, INV-24 as migration 0057, and INV-12, INV-13: a movement of a batch-tracked product names one
-- open batch of its variant, and moves that batch's quantity with the level, under the level's lock (taken first, as
-- the ledger takes it). The level's unsellable quantity is worked out again with it: the stock in its expired batches,
-- out of what is available. Reading the product FOR SHARE makes a movement wait for a batch-tracking switch in flight.
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
  RETURN NEW;
END $$;
--> statement-breakpoint
-- INV-12: a batch's quantity changes only through a movement (the movement trigger's own write, one trigger level
-- deeper), and a batch is opened empty except by the batch-tracking switch below. It is closed by that switch too, and
-- deleted only with its variant, or by LIF-19's day-60 deletion of an archived or deleted shop.
CREATE FUNCTION tenant.guard_stock_batch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (
      SELECT 1 FROM tenant.product_variants v WHERE v.tenant_id = OLD.tenant_id AND v.id = OLD.variant_id
    ) OR (
      current_setting('app.erasing_tenant', true) = OLD.tenant_id::text
      AND EXISTS (
        SELECT 1 FROM control.tenants t WHERE t.id = OLD.tenant_id AND t.state IN ('archived', 'deleted')
      )
    ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'a batch goes only with its variant or its shop''s day-60 deletion'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_batches_through_movements';
  END IF;
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'INSERT' AND (NEW.quantity <> 0 OR NEW.opening_quantity <> 0 OR NEW.closed_at IS NOT NULL))
     OR (TG_OP = 'UPDATE' AND (
       NEW.quantity IS DISTINCT FROM OLD.quantity
       OR NEW.opening_quantity IS DISTINCT FROM OLD.opening_quantity
       OR NEW.variant_id IS DISTINCT FROM OLD.variant_id
       OR NEW.is_default IS DISTINCT FROM OLD.is_default
       OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
     )) THEN
    RAISE EXCEPTION 'a batch''s stock changes only through a stock movement'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_batches_through_movements';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER stock_batches_guard BEFORE INSERT OR UPDATE OR DELETE ON tenant.stock_batches
  FOR EACH ROW EXECUTE FUNCTION tenant.guard_stock_batch();
--> statement-breakpoint
-- INV-12: turning batch tracking on puts the stock each variant already holds into its "no expiry" batch, as that
-- batch's opening quantity, with no movement (nothing moved). Turning it off closes the open batches, keeping them and
-- their history, and is refused while an expired batch still holds stock waiting to be written off (INV-13).
CREATE FUNCTION tenant.switch_batch_tracking() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.batch_tracked THEN
    INSERT INTO tenant.stock_batches (tenant_id, variant_id, is_default, opening_quantity, quantity)
    SELECT l.tenant_id, l.variant_id, true, l.on_hand, l.on_hand
    FROM tenant.stock_levels l
    JOIN tenant.product_variants v ON v.tenant_id = l.tenant_id AND v.id = l.variant_id
    WHERE v.tenant_id = NEW.tenant_id AND v.product_id = NEW.id AND l.on_hand > 0;
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM tenant.stock_batches b
    JOIN tenant.product_variants v ON v.tenant_id = b.tenant_id AND v.id = b.variant_id
    WHERE v.tenant_id = NEW.tenant_id AND v.product_id = NEW.id AND b.closed_at IS NULL
      AND b.quantity > 0 AND b.expires_on < tenant.dhaka_today()
  ) THEN
    RAISE EXCEPTION 'expired stock is written off before batch tracking is turned off'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'batches_off_after_write_off';
  END IF;
  UPDATE tenant.stock_batches b SET closed_at = now()
  FROM tenant.product_variants v
  WHERE v.tenant_id = b.tenant_id AND v.id = b.variant_id AND v.tenant_id = NEW.tenant_id
    AND v.product_id = NEW.id AND b.closed_at IS NULL;
  UPDATE tenant.stock_levels l SET unsellable = 0, updated_at = now()
  FROM tenant.product_variants v
  WHERE v.tenant_id = l.tenant_id AND v.id = l.variant_id AND v.tenant_id = NEW.tenant_id
    AND v.product_id = NEW.id AND l.unsellable <> 0;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER products_batch_tracking_switch AFTER UPDATE OF batch_tracked ON tenant.products
  FOR EACH ROW WHEN (NEW.batch_tracked IS DISTINCT FROM OLD.batch_tracked)
  EXECUTE FUNCTION tenant.switch_batch_tracking();
--> statement-breakpoint
-- INV-13: the daily expiry pass's step for one variant: under the level's lock, its unsellable quantity becomes the
-- stock in its expired open batches. True when that changed, so the caller works the product's stock state out again.
CREATE FUNCTION tenant.refresh_unsellable(p_tenant uuid, p_variant uuid) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  held numeric(14, 3);
  expired numeric(14, 3);
BEGIN
  SELECT l.unsellable INTO held FROM tenant.stock_levels l
  WHERE l.tenant_id = p_tenant AND l.variant_id = p_variant
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  SELECT coalesce(sum(b.quantity), 0) INTO expired FROM tenant.stock_batches b
  WHERE b.tenant_id = p_tenant AND b.variant_id = p_variant AND b.closed_at IS NULL
    AND b.expires_on < tenant.dhaka_today();
  IF expired = held THEN
    RETURN false;
  END IF;
  UPDATE tenant.stock_levels SET unsellable = expired, updated_at = now()
  WHERE tenant_id = p_tenant AND variant_id = p_variant;
  RETURN true;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    -- UPDATE for the expiry notice; a batch's stock is guarded above. DELETE for LIF-19 only.
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.stock_batches TO lytronix_app;
    GRANT USAGE, SELECT ON SEQUENCE tenant.stock_check_lines_id_seq TO lytronix_app;
  END IF;
END $$;
