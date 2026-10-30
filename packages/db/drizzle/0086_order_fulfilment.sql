CREATE TYPE "tenant"."payment_method" AS ENUM('cash_on_delivery', 'cash', 'bkash', 'nagad', 'rocket', 'upay', 'bank');--> statement-breakpoint
ALTER TYPE "tenant"."order_history_field" ADD VALUE 'return';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"method" "tenant"."payment_method" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"sender_number" varchar(15),
	"transaction_id" text,
	"verified_by" uuid,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_check" CHECK ("tenant"."payments"."amount" > 0),
	CONSTRAINT "payments_reference_check" CHECK (("tenant"."payments"."method" IN ('cash_on_delivery', 'cash')) = ("tenant"."payments"."transaction_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "tenant"."order_lines" ADD COLUMN "returned_quantity" numeric(14, 3) DEFAULT '0' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."payments" ADD CONSTRAINT "payments_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "tenant"."orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_order_idx" ON "tenant"."payments" USING btree ("tenant_id","order_id","verified_at");--> statement-breakpoint
ALTER TABLE "tenant"."order_lines" ADD CONSTRAINT "order_lines_returned_check" CHECK ("tenant"."order_lines"."returned_quantity" >= 0 AND "tenant"."order_lines"."returned_quantity" <= "tenant"."order_lines"."quantity");
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written security, grants and data (not expressible in Drizzle). Phase 4 Slice 4.3a.
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
ALTER TABLE tenant.payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.payments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.payments USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
-- A payment is never changed: it is recorded, and goes only with its order (LIF-19's day-60 deletion).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, DELETE ON tenant.payments TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- QTA-05 (2.1): orders handled per Asia/Dhaka day on each plan; a trial is held by its total instead (QTA-06). Growth and
-- Pro gain their per-period figure too, where an operator has not set one. A figure a plan already has is kept.
UPDATE control.plans p
SET limits = v.extra || p.limits
FROM (VALUES
  ('Pay-as-you-go', '{"orders_handled_daily": 50}'::jsonb),
  ('Starter', '{"orders_handled_daily": 60}'::jsonb),
  ('Growth', '{"orders_handled_monthly": 1500, "orders_handled_daily": 300}'::jsonb),
  ('Pro', '{"orders_handled_monthly": 6000, "orders_handled_daily": 1000}'::jsonb)
) AS v(name, extra)
WHERE p.name = v.name;
--> statement-breakpoint
-- PLN-05: a shop's frozen limits gain the new ones from its own plan, so every limit is read from the snapshot and
-- overrides, never a default in code.
UPDATE control.tenants t
SET plan_snapshot = t.plan_snapshot
  || CASE WHEN t.plan_snapshot ? 'orders_handled_daily' OR NOT (p.limits ? 'orders_handled_daily') THEN '{}'::jsonb
          ELSE jsonb_build_object('orders_handled_daily', p.limits -> 'orders_handled_daily') END
  || CASE WHEN t.plan_snapshot ? 'orders_handled_monthly' OR NOT (p.limits ? 'orders_handled_monthly') THEN '{}'::jsonb
          ELSE jsonb_build_object('orders_handled_monthly', p.limits -> 'orders_handled_monthly') END
FROM control.plans p
WHERE p.id = t.plan_id AND t.plan_snapshot IS NOT NULL;
--> statement-breakpoint
-- QTA-03 (editable): past the period's handling limit, the handling goes ahead and the owner is prompted to upgrade.
INSERT INTO control.platform_settings (key, value, description) VALUES
  ('order_limit_mode', '"allow_with_prompt"', 'Past the period''s order-handling limit: block, or allow with a prompt to upgrade (QTA-03).')
ON CONFLICT (key) DO NOTHING;
