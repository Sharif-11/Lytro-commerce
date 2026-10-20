CREATE TYPE "tenant"."serial_format" AS ENUM('imei', 'any');--> statement-breakpoint
CREATE TYPE "tenant"."serial_status" AS ENUM('in_stock', 'reserved', 'sold', 'returned', 'written_off');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."serial_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"serial" varchar(64) NOT NULL,
	"status" "tenant"."serial_status" DEFAULT 'in_stock' NOT NULL,
	"received_movement_id" bigint,
	"left_movement_id" bigint,
	"sold_order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "serial_numbers_tenant_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "tenant"."products" ADD COLUMN "serial_format" "tenant"."serial_format" DEFAULT 'any' NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."business_type_presets" ADD COLUMN "default_serial_format" "tenant"."serial_format" DEFAULT 'any' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."serial_numbers" ADD CONSTRAINT "serial_numbers_variant_fk" FOREIGN KEY ("tenant_id","variant_id") REFERENCES "tenant"."product_variants"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "serial_numbers_held_idx" ON "tenant"."serial_numbers" USING btree ("tenant_id","serial") WHERE "tenant"."serial_numbers"."status" IN ('in_stock', 'reserved');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "serial_numbers_variant_idx" ON "tenant"."serial_numbers" USING btree ("tenant_id","variant_id","status");--> statement-breakpoint
ALTER TABLE "tenant"."products" ADD CONSTRAINT "products_serial_units_check" CHECK (NOT ("tenant"."products"."serial_tracked" AND "tenant"."products"."stock_unit" IN ('kg', 'g', 'liter', 'ml')));--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written seed data, security, triggers and grants (not expressible in Drizzle). Reviewed with the schema above.
-- DATABASE-SCHEMA §3.2 (inventory), Phase 3 Slice 3b: serial numbers (INV-14, INV-23).
-- ---------------------------------------------------------------------------------------------

-- PST-02, INV-23: a phone shop's new products expect IMEIs; every other type, any code.
UPDATE control.business_type_presets SET default_serial_format = 'imei' WHERE key = 'mobiles_gadgets';
--> statement-breakpoint
-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
ALTER TABLE tenant.serial_numbers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.serial_numbers FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.serial_numbers
  USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
-- INV-14: a variant never holds more serials than units. Checked when the transaction commits, so a change that both
-- moves stock and marks the serials that went with it (in either order) is judged as a whole.
CREATE FUNCTION tenant.check_serials_within_stock() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  held integer;
  units numeric(14, 3);
BEGIN
  SELECT count(*) INTO held FROM tenant.serial_numbers s
  WHERE s.tenant_id = NEW.tenant_id AND s.variant_id = NEW.variant_id AND s.status IN ('in_stock', 'reserved');
  IF held = 0 THEN
    RETURN NULL;
  END IF;
  SELECT coalesce(max(l.on_hand), 0) INTO units FROM tenant.stock_levels l
  WHERE l.tenant_id = NEW.tenant_id AND l.variant_id = NEW.variant_id;
  IF held > units THEN
    RAISE EXCEPTION 'variant % holds % serials for % units', NEW.variant_id, held, units
      USING ERRCODE = 'check_violation', CONSTRAINT = 'serials_within_stock';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER serial_numbers_within_stock AFTER INSERT OR UPDATE ON tenant.serial_numbers
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tenant.check_serials_within_stock();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER stock_movements_serials_within_stock AFTER INSERT ON tenant.stock_movements
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tenant.check_serials_within_stock();
--> statement-breakpoint
-- INV-14: a serial belongs to a serial-numbered product, and once its unit has left (written off now, sold in Phase 4)
-- its row is history and never changes. While its unit is in stock the serial may be corrected or removed (a typo).
-- A row also goes with its variant, and with LIF-19's day-60 deletion of an archived or deleted shop.
CREATE FUNCTION tenant.guard_serial_number() RETURNS trigger
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
  IF OLD.status = 'written_off'
     OR (NEW.serial IS DISTINCT FROM OLD.serial AND OLD.status <> 'in_stock')
     OR NEW.variant_id IS DISTINCT FROM OLD.variant_id THEN
    RAISE EXCEPTION 'a serial whose unit has left is kept as history'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'serial_numbers_history';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER serial_numbers_guard BEFORE INSERT OR UPDATE OR DELETE ON tenant.serial_numbers
  FOR EACH ROW EXECUTE FUNCTION tenant.guard_serial_number();
--> statement-breakpoint
-- INV-14: serial tracking is turned off only while no unit of the product holds a serial, so a recorded serial never
-- drifts away from the unit it names. Turned on, every unit already held simply has no serial yet.
CREATE FUNCTION tenant.keep_serials_with_tracking() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM tenant.serial_numbers s
    JOIN tenant.product_variants v ON v.tenant_id = s.tenant_id AND v.id = s.variant_id
    WHERE v.tenant_id = NEW.tenant_id AND v.product_id = NEW.id AND s.status IN ('in_stock', 'reserved')
  ) THEN
    RAISE EXCEPTION 'serial tracking is turned off only while no unit holds a serial'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'serials_off_needs_none';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER products_serial_tracking_off BEFORE UPDATE OF serial_tracked ON tenant.products
  FOR EACH ROW WHEN (OLD.serial_tracked AND NOT NEW.serial_tracked)
  EXECUTE FUNCTION tenant.keep_serials_with_tracking();
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    -- UPDATE for a status or a corrected typo, DELETE for a removed serial; history is guarded above.
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.serial_numbers TO lytronix_app;
  END IF;
END $$;
