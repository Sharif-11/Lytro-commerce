CREATE TABLE IF NOT EXISTS "tenant"."courier_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"courier_key" text NOT NULL,
	"payout_id" varchar(64) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"charges" numeric(12, 2),
	"total" numeric(12, 2),
	"method" varchar(40),
	"paid_at" timestamp with time zone NOT NULL,
	"made_at" timestamp with time zone,
	"parcels" integer DEFAULT 0 NOT NULL,
	"ours" integer DEFAULT 0 NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courier_payouts_payout_key" UNIQUE("tenant_id","courier_key","payout_id")
);
--> statement-breakpoint
ALTER TABLE "tenant"."courier_connections" ADD COLUMN "payout_page" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant"."courier_connections" ADD COLUMN "payout_page_size" smallint;--> statement-breakpoint
ALTER TABLE "tenant"."courier_parcels" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant"."courier_parcels" ADD COLUMN "payout_id" varchar(64);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courier_payouts_paid_idx" ON "tenant"."courier_payouts" USING btree ("tenant_id","paid_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courier_parcels_payout_idx" ON "tenant"."courier_parcels" USING btree ("tenant_id","courier_key","payout_id");
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written security (not expressible in Drizzle). Phase 6 Slice 6.5, read agreed 2026-11-06.
-- ---------------------------------------------------------------------------------------------

-- CRR-17: a shop's courier payouts, only ever its own.
ALTER TABLE tenant.courier_payouts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.courier_payouts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.courier_payouts USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.courier_payouts TO lytronix_app;
  END IF;
END $$;
