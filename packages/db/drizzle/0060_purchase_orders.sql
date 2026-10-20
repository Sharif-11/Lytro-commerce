CREATE TYPE "tenant"."purchase_status" AS ENUM('draft', 'ordered', 'partially_received', 'received', 'closed_short', 'cancelled');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."purchase_counters" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."purchase_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"quantity_ordered" numeric(14, 3) NOT NULL,
	"quantity_received" numeric(14, 3) DEFAULT '0' NOT NULL,
	"unit_cost" numeric(12, 4),
	CONSTRAINT "purchase_order_lines_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "purchase_order_lines_variant_key" UNIQUE("purchase_order_id","variant_id"),
	CONSTRAINT "purchase_order_lines_ordered_check" CHECK ("tenant"."purchase_order_lines"."quantity_ordered" > 0),
	CONSTRAINT "purchase_order_lines_received_check" CHECK ("tenant"."purchase_order_lines"."quantity_received" >= 0),
	CONSTRAINT "purchase_order_lines_unit_cost_check" CHECK ("tenant"."purchase_order_lines"."unit_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" integer,
	"supplier_id" uuid,
	"status" "tenant"."purchase_status" DEFAULT 'draft' NOT NULL,
	"expected_on" date,
	"notes" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ordered_at" timestamp with time zone,
	CONSTRAINT "purchase_orders_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "purchase_orders_tenant_number_key" UNIQUE("tenant_id","number"),
	CONSTRAINT "purchase_orders_number_check" CHECK (("tenant"."purchase_orders"."status" = 'draft') = ("tenant"."purchase_orders"."number" IS NULL) AND ("tenant"."purchase_orders"."number" IS NULL) = ("tenant"."purchase_orders"."ordered_at" IS NULL)),
	CONSTRAINT "purchase_orders_number_positive_check" CHECK ("tenant"."purchase_orders"."number" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"phone" varchar(30),
	"email" varchar(254),
	"address" varchar(500),
	"notes" varchar(1000),
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_tenant_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_order_fk" FOREIGN KEY ("tenant_id","purchase_order_id") REFERENCES "tenant"."purchase_orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_fk" FOREIGN KEY ("tenant_id","supplier_id") REFERENCES "tenant"."suppliers"("tenant_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_order_lines_variant_idx" ON "tenant"."purchase_order_lines" USING btree ("tenant_id","variant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_tenant_created_idx" ON "tenant"."purchase_orders" USING btree ("tenant_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_supplier_idx" ON "tenant"."purchase_orders" USING btree ("tenant_id","supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_live_name_idx" ON "tenant"."suppliers" USING btree ("tenant_id",lower("name")) WHERE "tenant"."suppliers"."archived_at" IS NULL;--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written security, triggers and grants (not expressible in Drizzle). Reviewed with the schema above.
-- DATABASE-SCHEMA §3.2 (purchasing), Phase 3 Slice 4a.
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['suppliers', 'purchase_counters', 'purchase_orders', 'purchase_order_lines']
  LOOP
    EXECUTE format('ALTER TABLE tenant.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE tenant.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON tenant.%I USING (tenant_id = tenant.current_tenant_id()) '
      'WITH CHECK (tenant_id = tenant.current_tenant_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- PUR-02, UOM-03, INV-24: a purchase line names one of the product's own variants, in whole numbers unless the product
-- is counted in a measured unit, and never a size drawing on a shared stock (the shared stock itself is bought). A line
-- keeps its variant and its purchase for good. Once something has been received on it, it is deleted only with the
-- rest of a lapsed shop's data (LIF-19). The variant is held by value, so a line outlives a product deleted for good;
-- its quantities are then checked no further.
CREATE FUNCTION tenant.check_purchase_line() RETURNS trigger
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
CREATE TRIGGER purchase_order_lines_check BEFORE INSERT OR UPDATE OR DELETE ON tenant.purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION tenant.check_purchase_line();
--> statement-breakpoint
-- PUR-02, PUR-03: a purchase's number, once given, never changes, and a placed purchase never goes back to being a
-- draft, so the numbers stay gap-free. Only a draft is deleted, apart from LIF-19's day-60 deletion of a lapsed shop.
CREATE FUNCTION tenant.guard_purchase_order() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'draft'
      OR (
        current_setting('app.erasing_tenant', true) = OLD.tenant_id::text
        AND EXISTS (
          SELECT 1 FROM control.tenants t WHERE t.id = OLD.tenant_id AND t.state IN ('archived', 'deleted')
        )
      ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'a placed purchase is kept; cancel it instead'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'purchase_orders_kept';
  END IF;
  IF (OLD.number IS NOT NULL AND NEW.number IS DISTINCT FROM OLD.number)
     OR (OLD.status <> 'draft' AND NEW.status = 'draft') THEN
    RAISE EXCEPTION 'a placed purchase keeps its number'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'purchase_orders_kept';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER purchase_orders_guard BEFORE UPDATE OR DELETE ON tenant.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION tenant.guard_purchase_order();
--> statement-breakpoint
-- UOM-03, as migrations 0054 and 0057, and PUR-02: nor may a product move to a whole-number unit while a purchase not
-- yet finished (a draft, or placed and still open) buys a fraction of it.
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
    ) OR EXISTS (
      SELECT 1 FROM tenant.purchase_order_lines pl
      JOIN tenant.purchase_orders po ON po.tenant_id = pl.tenant_id AND po.id = pl.purchase_order_id
      WHERE pl.tenant_id = NEW.tenant_id AND pl.product_id = NEW.id
        AND po.status IN ('draft', 'ordered', 'partially_received')
        AND (pl.quantity_ordered <> trunc(pl.quantity_ordered) OR pl.quantity_received <> trunc(pl.quantity_received))
    )
  ) THEN
    RAISE EXCEPTION 'this product holds a fraction of stock, so it cannot be counted in %', NEW.stock_unit
      USING ERRCODE = 'check_violation', CONSTRAINT = 'stock_whole_units';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
-- The application role writes all four tables. DELETE on suppliers and counters is for LIF-19's day-60 deletion only
-- (a supplier is archived, never deleted); on purchases and lines the triggers above limit it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON tenant.suppliers, tenant.purchase_counters, tenant.purchase_orders, tenant.purchase_order_lines
      TO lytronix_app;
  END IF;
END $$;
