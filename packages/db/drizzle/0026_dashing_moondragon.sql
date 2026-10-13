CREATE TABLE IF NOT EXISTS "control"."rate_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"old_value" numeric(12, 4),
	"new_value" numeric(12, 4) NOT NULL,
	"changed_by" uuid,
	"notice_id" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."rates" (
	"key" text PRIMARY KEY NOT NULL,
	"value" numeric(12, 4) NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."shop_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"extra_delivery_charge_per_kg" numeric(10, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."balance_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"units" numeric(10, 2),
	"rate_used" numeric(12, 4),
	"reference" jsonb,
	"balance_after" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "control"."tenants" ADD COLUMN "last_activity_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "balance_ledger_tenant_created_idx" ON "tenant"."balance_ledger" USING btree ("tenant_id","created_at");--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written security and seed data (not expressible in Drizzle). Reviewed with the schema above.
-- ---------------------------------------------------------------------------------------------

-- BAL-02, DAT-10: the balance ledger is insert-only, whatever role connects. Reuses the same
-- tenant.reject_mutation() function tenant.activity_log already uses (migration 0001).
ALTER TABLE "tenant"."balance_ledger" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenant"."balance_ledger" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tenant"."balance_ledger"
  USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
CREATE TRIGGER balance_ledger_insert_only
  BEFORE UPDATE OR DELETE ON "tenant"."balance_ledger"
  FOR EACH ROW EXECUTE FUNCTION tenant.reject_mutation();
--> statement-breakpoint
-- RAT-14: per-tenant, not append-only (an operator editing a tenant's rate updates this row, not a new one).
ALTER TABLE "tenant"."shop_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenant"."shop_settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tenant"."shop_settings"
  USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
-- RAT-01: seeds the platform's starting per-use rates. control.rates and control.rate_history are
-- control-schema (platform-wide), so they carry no row-level security. sms_per_unit, sms_unit_size_chars,
-- payg_order_fee_min and payg_order_fee_pct come straight from the SRS's own worked examples (BAL-16,
-- PYG-02, SMS-09); ai_reply, fraud_check and payg_product_fee have no worked example yet, seeded at 0 as
-- an explicit placeholder (RAT-12/RAT-01's "[editable]" figures) until an operator sets a real one —
-- never silently free, just not yet decided.
INSERT INTO control.rates (key, value) VALUES
  ('sms_per_unit', 0.55),
  ('ai_reply', 0),
  ('fraud_check', 0),
  ('payg_order_fee_min', 20),
  ('payg_order_fee_pct', 1.5),
  ('payg_product_fee', 0),
  ('sms_unit_size_chars', 75)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
-- Application role grants. Each migration that adds a table must add its grants here, since a missing grant
-- fails closed (see migration 0001's note).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE ON control.rates TO lytronix_app;
    GRANT SELECT, INSERT ON control.rate_history TO lytronix_app;
    GRANT USAGE, SELECT ON SEQUENCE control.rate_history_id_seq TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.shop_settings TO lytronix_app;
    GRANT SELECT, INSERT ON tenant.balance_ledger TO lytronix_app;
    GRANT USAGE, SELECT ON SEQUENCE tenant.balance_ledger_id_seq TO lytronix_app;
    -- control.tenants already has table-level UPDATE granted (migration 0001); last_activity_at
    -- and balance_frozen/balance_amount need no extra grant.
  END IF;
END $$;