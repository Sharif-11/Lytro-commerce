CREATE TYPE "tenant"."call_outcome" AS ENUM('confirmed', 'no_answer', 'call_back_later', 'cancelled');--> statement-breakpoint
CREATE TYPE "tenant"."cancel_reason" AS ENUM('customer_cancelled', 'fake_order', 'unreachable', 'out_of_stock', 'duplicate', 'other');--> statement-breakpoint
CREATE TYPE "tenant"."fulfillment_status" AS ENUM('unfulfilled', 'processing', 'partially_shipped', 'shipped', 'partially_delivered', 'delivered', 'returned');--> statement-breakpoint
CREATE TYPE "tenant"."fulfilment_type" AS ENUM('delivery', 'takeaway', 'dine_in');--> statement-breakpoint
CREATE TYPE "tenant"."order_history_field" AS ENUM('created', 'confirmed', 'status_override', 'payment_status', 'fulfillment_status', 'unit_price', 'delivery_charge');--> statement-breakpoint
CREATE TYPE "tenant"."payment_status" AS ENUM('unverified', 'pending_verification', 'partially_paid', 'paid', 'payment_failed', 'refunded');--> statement-breakpoint
CREATE TYPE "tenant"."order_source" AS ENUM('dashboard', 'api', 'storefront', 'landing_page');--> statement-breakpoint
CREATE TYPE "tenant"."status_override" AS ENUM('hold', 'cancelled', 'in_review');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"phone" varchar(15),
	"name" varchar(100),
	"order_count" integer DEFAULT 0 NOT NULL,
	"total_spent" numeric(12, 2) DEFAULT '0' NOT NULL,
	"last_order_at" timestamp with time zone,
	"erased_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_tenant_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."order_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"outcome" "tenant"."call_outcome" NOT NULL,
	"call_back_at" timestamp with time zone,
	"note" varchar(500),
	"called_by" uuid,
	"called_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_calls_call_back_check" CHECK (("tenant"."order_calls"."outcome" = 'call_back_later') = ("tenant"."order_calls"."call_back_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."order_counters" (
	"tenant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "order_counters_tenant_id_day_pk" PRIMARY KEY("tenant_id","day")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"product_id" uuid,
	"variant_id" uuid,
	"product_name" varchar(200) NOT NULL,
	"sku" varchar(64),
	"attribute_values" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"captured_values" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"thumbnail_media_id" uuid,
	"thumbnail_url" text,
	"stock_unit" "tenant"."stock_unit" NOT NULL,
	"list_price" numeric(12, 2) NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"pack_amount" numeric(14, 3),
	"item_discount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"item_total" numeric(12, 2) NOT NULL,
	"weight_kg" numeric(10, 3),
	"own_delivery_charge" numeric(12, 2),
	"delivery_mode" "tenant"."delivery_mode" NOT NULL,
	"delivery_charge" numeric(12, 2) NOT NULL,
	"payment_policy" "tenant"."payment_policy" NOT NULL,
	"policy_advance" numeric(12, 2),
	"advance" numeric(12, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "order_lines_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "order_lines_quantity_check" CHECK ("tenant"."order_lines"."quantity" > 0),
	CONSTRAINT "order_lines_pack_check" CHECK ("tenant"."order_lines"."pack_amount" > 0),
	CONSTRAINT "order_lines_whole_units_check" CHECK ("tenant"."order_lines"."quantity" = trunc("tenant"."order_lines"."quantity")
        OR ("tenant"."order_lines"."pack_amount" IS NULL AND "tenant"."order_lines"."stock_unit" IN ('kg', 'g', 'liter', 'ml'))),
	CONSTRAINT "order_lines_money_check" CHECK ("tenant"."order_lines"."list_price" >= 0 AND "tenant"."order_lines"."unit_price" >= 0 AND "tenant"."order_lines"."item_discount" >= 0 AND "tenant"."order_lines"."item_total" >= 0
        AND "tenant"."order_lines"."delivery_charge" >= 0 AND "tenant"."order_lines"."own_delivery_charge" >= 0 AND "tenant"."order_lines"."advance" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."order_status_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"field" "tenant"."order_history_field" NOT NULL,
	"old_value" text,
	"new_value" text,
	"note" varchar(500),
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_number" varchar(16),
	"tracking_id" varchar(8) NOT NULL,
	"source" "tenant"."order_source" DEFAULT 'dashboard' NOT NULL,
	"fulfilment_type" "tenant"."fulfilment_type" DEFAULT 'delivery' NOT NULL,
	"customer_id" uuid,
	"customer_name" varchar(100),
	"customer_phone" varchar(15),
	"location_id" integer,
	"delivery_address" varchar(500),
	"table_ref" varchar(30),
	"delivery_zone_id" uuid,
	"delivery_zone_name" jsonb,
	"zone_charge" numeric(12, 2),
	"extra_charge_per_kg" numeric(12, 2) DEFAULT '0' NOT NULL,
	"payment_status" "tenant"."payment_status" DEFAULT 'unverified' NOT NULL,
	"fulfillment_status" "tenant"."fulfillment_status" DEFAULT 'unfulfilled' NOT NULL,
	"status_override" "tenant"."status_override",
	"hold_until" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" uuid,
	"cancel_reason" "tenant"."cancel_reason",
	"cancel_note" varchar(500),
	"cancelled_at" timestamp with time zone,
	"subtotal" numeric(12, 2) NOT NULL,
	"delivery_charge" numeric(12, 2) NOT NULL,
	"delivery_charge_by_hand" boolean DEFAULT false NOT NULL,
	"discount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"grand_total" numeric(12, 2) NOT NULL,
	"advance_due" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cod_amount" numeric(12, 2) NOT NULL,
	"due" numeric(12, 2) NOT NULL,
	"courier_name" varchar(80),
	"tracking_code" varchar(100),
	"tracking_link" varchar(500),
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"handled_at" timestamp with time zone,
	"notes" varchar(1000),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "orders_tenant_number_key" UNIQUE("tenant_id","order_number"),
	CONSTRAINT "orders_tracking_id_key" UNIQUE("tracking_id"),
	CONSTRAINT "orders_fulfilment_check" CHECK (CASE "tenant"."orders"."fulfilment_type"
        WHEN 'delivery' THEN "tenant"."orders"."customer_name" IS NOT NULL AND "tenant"."orders"."customer_phone" IS NOT NULL
          AND "tenant"."orders"."location_id" IS NOT NULL AND "tenant"."orders"."delivery_address" IS NOT NULL AND "tenant"."orders"."table_ref" IS NULL
        WHEN 'takeaway' THEN "tenant"."orders"."customer_name" IS NOT NULL AND "tenant"."orders"."customer_phone" IS NOT NULL
          AND "tenant"."orders"."location_id" IS NULL AND "tenant"."orders"."delivery_address" IS NULL AND "tenant"."orders"."table_ref" IS NULL
        ELSE "tenant"."orders"."table_ref" IS NOT NULL AND "tenant"."orders"."location_id" IS NULL AND "tenant"."orders"."delivery_address" IS NULL
      END),
	CONSTRAINT "orders_delivery_charge_check" CHECK ("tenant"."orders"."fulfilment_type" = 'delivery' OR ("tenant"."orders"."delivery_charge" = 0 AND "tenant"."orders"."zone_charge" IS NULL)),
	CONSTRAINT "orders_cancel_check" CHECK (("tenant"."orders"."status_override" IS NOT DISTINCT FROM 'cancelled') = ("tenant"."orders"."cancel_reason" IS NOT NULL)
        AND ("tenant"."orders"."cancel_reason" IS NOT NULL) = ("tenant"."orders"."cancelled_at" IS NOT NULL)),
	CONSTRAINT "orders_hold_check" CHECK ("tenant"."orders"."hold_until" IS NULL OR "tenant"."orders"."status_override" IS NOT DISTINCT FROM 'hold'),
	CONSTRAINT "orders_money_check" CHECK ("tenant"."orders"."subtotal" >= 0 AND "tenant"."orders"."delivery_charge" >= 0 AND "tenant"."orders"."discount" >= 0 AND "tenant"."orders"."grand_total" >= 0
        AND "tenant"."orders"."advance_due" >= 0 AND "tenant"."orders"."cod_amount" >= 0 AND "tenant"."orders"."advance_due" + "tenant"."orders"."cod_amount" = "tenant"."orders"."grand_total")
);
--> statement-breakpoint
-- D4-8: a key belongs to one shop and one caller. A stored reply lasts a day, so the keys of the old global scheme are
-- simply let go.
DELETE FROM "control"."idempotency_keys";--> statement-breakpoint
ALTER TABLE "control"."idempotency_keys" DROP CONSTRAINT "idempotency_keys_pkey";--> statement-breakpoint
ALTER TABLE "control"."idempotency_keys" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."idempotency_keys" ADD COLUMN "caller" text NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."idempotency_keys" ADD CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY("tenant_id","caller","key");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."order_calls" ADD CONSTRAINT "order_calls_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "tenant"."orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."order_lines" ADD CONSTRAINT "order_lines_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "tenant"."orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."order_status_history" ADD CONSTRAINT "order_status_history_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "tenant"."orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."orders" ADD CONSTRAINT "orders_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "tenant"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customers_phone_idx" ON "tenant"."customers" USING btree ("tenant_id","phone") WHERE "tenant"."customers"."phone" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_name_trgm_idx" ON "tenant"."customers" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_phone_trgm_idx" ON "tenant"."customers" USING gin ("phone" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_tenant_last_order_idx" ON "tenant"."customers" USING btree ("tenant_id","last_order_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_calls_order_idx" ON "tenant"."order_calls" USING btree ("tenant_id","order_id","called_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_lines_order_idx" ON "tenant"."order_lines" USING btree ("tenant_id","order_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_lines_product_idx" ON "tenant"."order_lines" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_lines_thumbnail_idx" ON "tenant"."order_lines" USING btree ("tenant_id","thumbnail_media_id") WHERE "tenant"."order_lines"."thumbnail_media_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_status_history_order_idx" ON "tenant"."order_status_history" USING btree ("tenant_id","order_id","changed_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_tenant_created_idx" ON "tenant"."orders" USING btree ("tenant_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_handled_idx" ON "tenant"."orders" USING btree ("tenant_id","handled_at") WHERE "tenant"."orders"."handled_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_customer_idx" ON "tenant"."orders" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_customer_name_trgm_idx" ON "tenant"."orders" USING gin ("customer_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_customer_phone_trgm_idx" ON "tenant"."orders" USING gin ("customer_phone" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_number_trgm_idx" ON "tenant"."orders" USING gin ("order_number" gin_trgm_ops);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."serial_numbers" ADD CONSTRAINT "serial_numbers_order_fk" FOREIGN KEY ("tenant_id","sold_order_id") REFERENCES "tenant"."orders"("tenant_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."stock_reservations" ADD CONSTRAINT "stock_reservations_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "tenant"."orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."stock_reservations" ADD CONSTRAINT "stock_reservations_line_fk" FOREIGN KEY ("tenant_id","order_line_id") REFERENCES "tenant"."order_lines"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written security, triggers and grants (not expressible in Drizzle). Reviewed with the schema above.
-- DATABASE-SCHEMA §3.3 (orders), Phase 4 Slice 4.1.
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customers', 'order_counters', 'orders', 'order_lines', 'order_status_history', 'order_calls']
  LOOP
    EXECUTE format('ALTER TABLE tenant.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE tenant.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON tenant.%I USING (tenant_id = tenant.current_tenant_id()) '
      'WITH CHECK (tenant_id = tenant.current_tenant_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- ORD-04, ORD-05, ORD-12: an order keeps its number (once given), tracking ID, source and making time for good. It is deleted only
-- before it ships and while no payment on it is verified (stock it holds is let go first), apart from LIF-19's day-60
-- deletion of a lapsed shop.
CREATE FUNCTION tenant.guard_order() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF (OLD.fulfillment_status IN ('unfulfilled', 'processing')
        AND OLD.payment_status IN ('unverified', 'pending_verification', 'payment_failed'))
      OR (
        current_setting('app.erasing_tenant', true) = OLD.tenant_id::text
        AND EXISTS (
          SELECT 1 FROM control.tenants t WHERE t.id = OLD.tenant_id AND t.state IN ('archived', 'deleted')
        )
      ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'an order that has shipped or been paid is kept; cancel or return it instead'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'orders_kept';
  END IF;
  IF (OLD.order_number IS NOT NULL AND NEW.order_number IS DISTINCT FROM OLD.order_number)
     OR NEW.tracking_id IS DISTINCT FROM OLD.tracking_id
     OR NEW.source IS DISTINCT FROM OLD.source OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'an order keeps its number, tracking ID, source and making time'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'orders_kept';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER orders_guard BEFORE UPDATE OR DELETE ON tenant.orders
  FOR EACH ROW EXECUTE FUNCTION tenant.guard_order();
--> statement-breakpoint
-- ORD-04, KNOWN-GAPS §98: an order takes its number last in its own transaction, so the day's counter is held only
-- while the order is finished; it is never committed without one.
CREATE FUNCTION tenant.check_order_numbered() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM tenant.orders o WHERE o.tenant_id = NEW.tenant_id AND o.id = NEW.id AND o.order_number IS NULL
  ) THEN
    RAISE EXCEPTION 'an order is numbered before it is saved'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'orders_numbered';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER orders_numbered AFTER INSERT ON tenant.orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tenant.check_order_numbered();
--> statement-breakpoint
-- ORD-08, ORD-51: an order's history and its calls are a record, never changed; they go only with their order, or
-- with the rest of a lapsed shop's data (LIF-19).
CREATE FUNCTION tenant.keep_order_record() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (
    NOT EXISTS (SELECT 1 FROM tenant.orders o WHERE o.tenant_id = OLD.tenant_id AND o.id = OLD.order_id)
    OR (
      current_setting('app.erasing_tenant', true) = OLD.tenant_id::text
      AND EXISTS (
        SELECT 1 FROM control.tenants t WHERE t.id = OLD.tenant_id AND t.state IN ('archived', 'deleted')
      )
    )
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'an order''s history and calls are kept as they were'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'order_records_kept';
END $$;
--> statement-breakpoint
CREATE TRIGGER order_status_history_kept BEFORE UPDATE OR DELETE ON tenant.order_status_history
  FOR EACH ROW EXECUTE FUNCTION tenant.keep_order_record();
--> statement-breakpoint
CREATE TRIGGER order_calls_kept BEFORE UPDATE OR DELETE ON tenant.order_calls
  FOR EACH ROW EXECUTE FUNCTION tenant.keep_order_record();
--> statement-breakpoint
-- CUS-01, CUS-09: a customer is never deleted -- a privacy request erases its name and phone instead -- apart from
-- LIF-19's day-60 deletion of a lapsed shop.
CREATE FUNCTION tenant.keep_customer() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.erasing_tenant', true) = OLD.tenant_id::text
     AND EXISTS (
       SELECT 1 FROM control.tenants t WHERE t.id = OLD.tenant_id AND t.state IN ('archived', 'deleted')
     ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'a customer is erased, not deleted'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'customers_kept';
END $$;
--> statement-breakpoint
CREATE TRIGGER customers_kept BEFORE DELETE ON tenant.customers
  FOR EACH ROW EXECUTE FUNCTION tenant.keep_customer();
--> statement-breakpoint
-- INV-15, as migration 0062, and ORD-11, ORD-12: the stock held for an order now names the order and its line by key. A
-- reservation already let go goes with a deleted order, or with an item taken off an order, since there is nothing
-- left for it to record; one still holding stock is let go first.
CREATE OR REPLACE FUNCTION tenant.apply_stock_reservation() RETURNS trigger
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
    IF OLD.status = 'released' AND (
      NOT EXISTS (SELECT 1 FROM tenant.orders o WHERE o.tenant_id = OLD.tenant_id AND o.id = OLD.order_id)
      OR NOT EXISTS (
        SELECT 1 FROM tenant.order_lines l WHERE l.tenant_id = OLD.tenant_id AND l.id = OLD.order_line_id
      )
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
-- The application role writes all of these; the triggers above limit what an update or delete may do.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.customers, tenant.order_counters, tenant.orders,
      tenant.order_lines, tenant.order_status_history, tenant.order_calls TO lytronix_app;
    GRANT USAGE, SELECT ON SEQUENCE tenant.order_status_history_id_seq TO lytronix_app;
  END IF;
END $$;
