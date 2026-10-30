ALTER TABLE "tenant"."orders" DROP CONSTRAINT "orders_fulfilment_check";--> statement-breakpoint
ALTER TABLE "tenant"."orders" ADD COLUMN "customer_erased_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant"."customers" ADD CONSTRAINT "customers_erased_check" CHECK ("tenant"."customers"."erased_at" IS NULL OR ("tenant"."customers"."phone" IS NULL AND "tenant"."customers"."name" IS NULL));--> statement-breakpoint
ALTER TABLE "tenant"."orders" ADD CONSTRAINT "orders_erased_check" CHECK ("tenant"."orders"."customer_erased_at" IS NULL OR ("tenant"."orders"."customer_name" IS NULL AND "tenant"."orders"."customer_phone" IS NULL
        AND "tenant"."orders"."delivery_address" IS NULL AND "tenant"."orders"."shopper_note" IS NULL));--> statement-breakpoint
ALTER TABLE "tenant"."orders" ADD CONSTRAINT "orders_fulfilment_check" CHECK (CASE "tenant"."orders"."fulfilment_type"
        WHEN 'delivery' THEN ("tenant"."orders"."customer_erased_at" IS NOT NULL OR ("tenant"."orders"."customer_name" IS NOT NULL
          AND "tenant"."orders"."customer_phone" IS NOT NULL AND "tenant"."orders"."delivery_address" IS NOT NULL))
          AND "tenant"."orders"."location_id" IS NOT NULL AND "tenant"."orders"."table_ref" IS NULL
        WHEN 'takeaway' THEN ("tenant"."orders"."customer_erased_at" IS NOT NULL OR ("tenant"."orders"."customer_name" IS NOT NULL
          AND "tenant"."orders"."customer_phone" IS NOT NULL))
          AND "tenant"."orders"."location_id" IS NULL AND "tenant"."orders"."delivery_address" IS NULL AND "tenant"."orders"."table_ref" IS NULL
        ELSE "tenant"."orders"."table_ref" IS NOT NULL AND "tenant"."orders"."location_id" IS NULL AND "tenant"."orders"."delivery_address" IS NULL
      END);
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written guard (not expressible in Drizzle). Phase 4 Slice 4.4a, CUS-09, agreed 2026-10-30.
-- ---------------------------------------------------------------------------------------------

-- A customer deleted at a privacy request stays deleted, and so do its orders' personal details: the checks above keep
-- them blank while erased, and this keeps the erasure itself.
CREATE FUNCTION tenant.guard_erasure() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Nested, not joined with AND: each table's own column is read only on that table's rows.
  IF TG_TABLE_NAME = 'customers' THEN
    IF OLD.erased_at IS NOT NULL AND NEW.erased_at IS NULL THEN
      RAISE EXCEPTION 'an erased customer stays erased'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'customers_erasure_kept';
    END IF;
  ELSIF OLD.customer_erased_at IS NOT NULL AND NEW.customer_erased_at IS NULL THEN
    RAISE EXCEPTION 'an erased order stays erased'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'orders_erasure_kept';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER customers_erasure_guard BEFORE UPDATE ON tenant.customers
  FOR EACH ROW EXECUTE FUNCTION tenant.guard_erasure();
--> statement-breakpoint
CREATE TRIGGER orders_erasure_guard BEFORE UPDATE ON tenant.orders
  FOR EACH ROW EXECUTE FUNCTION tenant.guard_erasure();
