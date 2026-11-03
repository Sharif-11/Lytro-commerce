CREATE TYPE "tenant"."gateway_result" AS ENUM('cancelled', 'failed');--> statement-breakpoint
ALTER TYPE "tenant"."payment_review_reason" ADD VALUE 'by_hand';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."payment_method_ways" (
	"tenant_id" uuid NOT NULL,
	"method" "tenant"."payment_method" NOT NULL,
	"way" text NOT NULL,
	CONSTRAINT "payment_method_ways_pkey" PRIMARY KEY("tenant_id","method"),
	CONSTRAINT "payment_method_ways_way_check" CHECK ("tenant"."payment_method_ways"."way" IN ('automated', 'listener', 'manual'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."gateway_credential_uses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"method" text NOT NULL,
	"action" text NOT NULL,
	"account_id" uuid NOT NULL,
	"session_id" uuid,
	"succeeded" boolean NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant"."payments" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant"."wallet_accounts" ADD COLUMN "gateway_credentials" "bytea";--> statement-breakpoint
ALTER TABLE "tenant"."wallet_accounts" ADD COLUMN "gateway_sandbox" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant"."wallet_accounts" ADD COLUMN "automated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant"."payment_sessions" ADD COLUMN "gateway_account_id" uuid;--> statement-breakpoint
ALTER TABLE "tenant"."payment_sessions" ADD COLUMN "gateway_payment_id" varchar(100);--> statement-breakpoint
ALTER TABLE "tenant"."payment_sessions" ADD COLUMN "gateway_url" text;--> statement-breakpoint
ALTER TABLE "tenant"."payment_sessions" ADD COLUMN "gateway_result" "tenant"."gateway_result";--> statement-breakpoint
ALTER TABLE "tenant"."payment_sessions" ADD COLUMN "fee_held" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant"."payment_sessions" ADD COLUMN "test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gateway_credential_uses_tenant_idx" ON "tenant"."gateway_credential_uses" USING btree ("tenant_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_accounts_automated_key" ON "tenant"."wallet_accounts" USING btree ("tenant_id","method") WHERE "tenant"."wallet_accounts"."automated";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_sessions_gateway_idx" ON "tenant"."payment_sessions" USING btree ("tenant_id","expires_at") WHERE "tenant"."payment_sessions"."state" = 'awaiting_payment' AND "tenant"."payment_sessions"."gateway_payment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_sessions_fee_held_idx" ON "tenant"."payment_sessions" USING btree ("tenant_id") WHERE "tenant"."payment_sessions"."state" = 'awaiting_payment' AND "tenant"."payment_sessions"."fee_held" > 0;--> statement-breakpoint
ALTER TABLE "tenant"."wallet_accounts" ADD CONSTRAINT "wallet_accounts_automated_check" CHECK (NOT "tenant"."wallet_accounts"."automated" OR "tenant"."wallet_accounts"."gateway_credentials" IS NOT NULL);
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written security (not expressible in Drizzle). Phase 5 Slice 5.7, read agreed 2026-11-03.
-- ---------------------------------------------------------------------------------------------

-- PAY-06: how each shop takes a method's money, and SEC-11: its log of its credentials' uses, each only ever its own.
ALTER TABLE tenant.payment_method_ways ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.payment_method_ways FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.payment_method_ways USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
ALTER TABLE tenant.gateway_credential_uses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.gateway_credential_uses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.gateway_credential_uses USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.payment_method_ways TO lytronix_app;
    -- The log is only ever added to and read, and goes with the shop at day 60.
    GRANT SELECT, INSERT, DELETE ON tenant.gateway_credential_uses TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- RAT-15: the fee a payment verified by a wallet's own checkout pays, a share of what it took, changed in operator settings.
INSERT INTO control.rates (key, value) VALUES ('gateway_verification_pct', 1.00)
  ON CONFLICT (key) DO NOTHING;
