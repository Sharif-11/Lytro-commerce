CREATE TABLE IF NOT EXISTS "tenant"."fraud_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"phone" varchar(11) NOT NULL,
	"trigger" text NOT NULL,
	"order_id" uuid,
	"user_id" uuid,
	"steadfast_state" text NOT NULL,
	"steadfast_from" uuid,
	"steadfast_delivered_percent" smallint,
	"steadfast_cancelled_percent" smallint,
	"steadfast_returned_percent" smallint,
	"steadfast_volume_band" varchar(20),
	"steadfast_volume_range" varchar(20),
	"steadfast_reports" integer,
	"steadfast_doubtful" boolean,
	"steadfast_categories" jsonb,
	"own_delivered" integer NOT NULL,
	"own_returned" integer NOT NULL,
	"own_cancelled" integer NOT NULL,
	"cost" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fraud_checks_phone_check" CHECK ("tenant"."fraud_checks"."phone" ~ '^01[3-9][0-9]{8}$'),
	CONSTRAINT "fraud_checks_trigger_check" CHECK ("tenant"."fraud_checks"."trigger" in ('staff','order')),
	CONSTRAINT "fraud_checks_steadfast_state_check" CHECK ("tenant"."fraud_checks"."steadfast_state" in ('answered','not_connected','failed')),
	CONSTRAINT "fraud_checks_counts_check" CHECK ("tenant"."fraud_checks"."own_delivered" >= 0 AND "tenant"."fraud_checks"."own_returned" >= 0 AND "tenant"."fraud_checks"."own_cancelled" >= 0 AND "tenant"."fraud_checks"."cost" >= 0),
	CONSTRAINT "fraud_checks_answered_check" CHECK (("tenant"."fraud_checks"."steadfast_state" = 'answered') = ("tenant"."fraud_checks"."steadfast_reports" IS NOT NULL)
        AND ("tenant"."fraud_checks"."steadfast_from" IS NULL OR "tenant"."fraud_checks"."steadfast_state" = 'answered'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."fraud_rules" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"cod_orders" boolean NOT NULL,
	"min_amount" numeric(12, 2),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fraud_rules_amount_check" CHECK ("tenant"."fraud_rules"."min_amount" IS NULL OR "tenant"."fraud_rules"."min_amount" >= 0)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."fraud_checks" ADD CONSTRAINT "fraud_checks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "tenant"."orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fraud_checks_phone_idx" ON "tenant"."fraud_checks" USING btree ("tenant_id","phone","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fraud_checks_order_idx" ON "tenant"."fraud_checks" USING btree ("order_id");
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written security and settings (not expressible in Drizzle). Phase 7 Slice 7.5, read agreed 2026-11-07.
-- ---------------------------------------------------------------------------------------------

-- FRD-01, FRD-04: a shop's own checks, only ever its own. Written once and never changed.
ALTER TABLE tenant.fraud_checks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.fraud_checks FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.fraud_checks USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
-- FRD-05: a shop's automatic check, only ever its own.
ALTER TABLE tenant.fraud_rules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.fraud_rules FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.fraud_rules USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT ON tenant.fraud_checks TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE ON tenant.fraud_rules TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- FRD-07 (Slice 7.5): one shop's checks a minute; changed in operator settings without a release.
INSERT INTO control.platform_settings (key, value, description) VALUES
  ('fraud_checks_per_shop_per_minute', '30', 'How many fraud checks one shop may run in a minute, by staff or on new orders (FRD-07).')
ON CONFLICT (key) DO NOTHING;
