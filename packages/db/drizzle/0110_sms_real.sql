CREATE TABLE IF NOT EXISTS "tenant"."sms_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"to_phone" varchar(15) NOT NULL,
	"units" integer NOT NULL,
	"cost" numeric(10, 2) NOT NULL,
	"is_essential" boolean NOT NULL,
	"status" text NOT NULL,
	"blocked_reason" text,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_log_units_check" CHECK ("tenant"."sms_log"."units" > 0),
	CONSTRAINT "sms_log_cost_check" CHECK ("tenant"."sms_log"."cost" >= 0),
	CONSTRAINT "sms_log_status_check" CHECK ("tenant"."sms_log"."status" in ('sent', 'failed', 'blocked') AND ("tenant"."sms_log"."status" = 'blocked') = ("tenant"."sms_log"."blocked_reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_log_tenant_idx" ON "tenant"."sms_log" USING btree ("tenant_id","created_at");--> statement-breakpoint
-- D7-13 (Phase 7 Slice 7.1): the allowance counts SMS-09's units, the same as charging, not the network's parts.
ALTER TABLE "control"."essential_sms_usage" RENAME COLUMN "parts" TO "units";
--> statement-breakpoint
ALTER TABLE "control"."verification_challenges" ADD COLUMN "requested_ip" "inet";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_challenges_ip_idx" ON "control"."verification_challenges" USING btree ("requested_ip","created_at");--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written security and settings (not expressible in Drizzle). Phase 7 Slice 7.1, read agreed 2026-11-06.
-- ---------------------------------------------------------------------------------------------

-- SMS-07, SMS-17: a shop's own SMS log, only ever its own.
ALTER TABLE tenant.sms_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.sms_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.sms_log USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT ON tenant.sms_log TO lytronix_app;
    GRANT USAGE, SELECT ON SEQUENCE tenant.sms_log_id_seq TO lytronix_app;
    -- SMS-08: a code that never went out gives back the allowance it took.
    GRANT DELETE ON control.essential_sms_usage TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- RAT-13, D7-25 (the read agreed 2026-11-06): a unit holds at most one Bangla part (67 characters once a message needs
-- two), so no SMS costs more than it earns. Only the untouched seed moves -- never a value an operator already set (any
-- rate_history row for the key) -- and the change is recorded in rate_history like any edit, as migration 0048 did.
WITH changed AS (
  UPDATE control.rates
  SET value = 67, effective_from = now()
  WHERE key = 'sms_unit_size_chars'
    AND value = 75
    AND NOT EXISTS (SELECT 1 FROM control.rate_history WHERE key = 'sms_unit_size_chars')
  RETURNING key
)
INSERT INTO control.rate_history (key, old_value, new_value, changed_by)
SELECT key, 75, 67, NULL FROM changed;
