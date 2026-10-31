CREATE TYPE "tenant"."payment_session_source" AS ENUM('checkout', 'staff_link');--> statement-breakpoint
CREATE TYPE "tenant"."payment_session_state" AS ENUM('awaiting_payment', 'checking', 'verified', 'needs_review', 'failed', 'expired', 'cancelled');--> statement-breakpoint
ALTER TYPE "tenant"."cancel_reason" ADD VALUE 'advance_not_paid' BEFORE 'other';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."payment_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ref" varchar(32) NOT NULL,
	"order_id" uuid NOT NULL,
	"source" "tenant"."payment_session_source" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"method" "tenant"."payment_method",
	"return_url" varchar(500),
	"cancel_url" varchar(500),
	"state" "tenant"."payment_session_state" DEFAULT 'awaiting_payment' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"transaction_id" varchar(20),
	"sender_number" varchar(11),
	"paid_to" jsonb,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_sessions_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "payment_sessions_amount_check" CHECK ("tenant"."payment_sessions"."amount" > 0),
	CONSTRAINT "payment_sessions_submitted_check" CHECK (("tenant"."payment_sessions"."transaction_id" IS NULL) = ("tenant"."payment_sessions"."submitted_at" IS NULL)
        AND ("tenant"."payment_sessions"."state" <> 'checking' OR "tenant"."payment_sessions"."transaction_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."payment_session_refs" (
	"ref" varchar(32) PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."payment_sessions" ADD CONSTRAINT "payment_sessions_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "tenant"."orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."payment_session_refs" ADD CONSTRAINT "payment_session_refs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_sessions_ref_key" ON "tenant"."payment_sessions" USING btree ("ref");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_sessions_open_key" ON "tenant"."payment_sessions" USING btree ("tenant_id","order_id") WHERE "tenant"."payment_sessions"."state" IN ('awaiting_payment', 'checking', 'needs_review');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_sessions_expiry_idx" ON "tenant"."payment_sessions" USING btree ("tenant_id","expires_at") WHERE "tenant"."payment_sessions"."state" = 'awaiting_payment';
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written isolation and grants (not expressible in Drizzle). Phase 5 Slice 5.2, PAY-01 to PAY-08, agreed 2026-10-31.
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
ALTER TABLE tenant.payment_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.payment_sessions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.payment_sessions USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
-- The application role opens a session with its order, records what the shopper typed and moves its state; a session
-- goes with its order (the cascade, and the day-60 deletion). Its reference is found by the page before the shop is
-- known, so it lives in control, and goes with the shop's data.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.payment_sessions TO lytronix_app;
    GRANT SELECT, INSERT, DELETE ON control.payment_session_refs TO lytronix_app;
  END IF;
END $$;
