-- Phase 7 Slice 7.7: why a new order's automatic fraud check didn't run (FRD-05), kept for the order's page -- the rule
-- off, the order under the rule's smallest amount (kept as it was then), the check refused with its message, or the
-- minute's checks used up. Each shop's own, under row-level security.
CREATE TABLE IF NOT EXISTS "tenant"."fraud_check_skips" (
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"min_amount" numeric(12, 2),
	"message_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fraud_check_skips_tenant_id_order_id_pk" PRIMARY KEY("tenant_id","order_id"),
	CONSTRAINT "fraud_check_skips_reason_check" CHECK ("tenant"."fraud_check_skips"."reason" in ('rule_off','below_minimum','refused','minute_limit'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."fraud_check_skips" ADD CONSTRAINT "fraud_check_skips_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "tenant"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE tenant.fraud_check_skips ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.fraud_check_skips FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.fraud_check_skips USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT ON tenant.fraud_check_skips TO lytronix_app;
  END IF;
END $$;
