-- Phase 7 Slice 7.2 (read agreed 2026-11-06): a shop's SMS settings (SMS-02, SMS-10, SMS-13, SMS-16, SMS-19), and the
-- order and words of each SMS event in its log.
CREATE TABLE IF NOT EXISTS "tenant"."sms_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"events" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"templates" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sms_name" varchar(60),
	"monthly_spend_cap" numeric(10, 2),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant"."sms_log" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "tenant"."sms_log" ADD COLUMN "body" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_log_order_idx" ON "tenant"."sms_log" USING btree ("tenant_id","order_id");--> statement-breakpoint
ALTER TABLE tenant.sms_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.sms_settings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.sms_settings USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE ON tenant.sms_settings TO lytronix_app;
  END IF;
END $$;
