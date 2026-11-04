CREATE TYPE "tenant"."courier_connection_state" AS ENUM('active', 'login_refused');--> statement-breakpoint
CREATE TYPE "tenant"."parcel_state" AS ENUM('booking', 'booked', 'unknown', 'refused', 'cancelled');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."courier_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"courier_key" text NOT NULL,
	"credentials" "bytea" NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"state" "tenant"."courier_connection_state" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courier_connections_courier_key" UNIQUE("tenant_id","courier_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."courier_credential_uses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"courier_key" text NOT NULL,
	"action" text NOT NULL,
	"connection_id" uuid,
	"order_id" uuid,
	"succeeded" boolean NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."courier_parcels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"courier_key" text NOT NULL,
	"connection_id" uuid,
	"state" "tenant"."parcel_state" DEFAULT 'booking' NOT NULL,
	"invoice" varchar(100) NOT NULL,
	"consignment_id" varchar(100),
	"tracking_code" varchar(100),
	"courier_status" varchar(100),
	"cod" numeric(12, 2) NOT NULL,
	"note" varchar(500),
	"weight_kg" numeric(10, 3),
	"area_code" text,
	"delivery_charge" numeric(12, 2),
	"fee_held" numeric(12, 2) DEFAULT '0' NOT NULL,
	"fee_rates" jsonb,
	"took_place" boolean DEFAULT false NOT NULL,
	"serials" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"serial_numbers" text[] DEFAULT '{}' NOT NULL,
	"refusal" varchar(200),
	"settled_at" timestamp with time zone,
	"settle_problem" text,
	"look_ups" smallint DEFAULT 0 NOT NULL,
	"not_found" smallint DEFAULT 0 NOT NULL,
	"next_look_up_at" timestamp with time zone,
	"booked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."courier_parcels" ADD CONSTRAINT "courier_parcels_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "tenant"."orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "courier_connections_default_key" ON "tenant"."courier_connections" USING btree ("tenant_id") WHERE "tenant"."courier_connections"."is_default";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courier_credential_uses_tenant_idx" ON "tenant"."courier_credential_uses" USING btree ("tenant_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "courier_parcels_live_key" ON "tenant"."courier_parcels" USING btree ("tenant_id","order_id") WHERE "tenant"."courier_parcels"."state" IN ('booking', 'booked', 'unknown');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courier_parcels_order_idx" ON "tenant"."courier_parcels" USING btree ("tenant_id","order_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courier_parcels_fee_held_idx" ON "tenant"."courier_parcels" USING btree ("tenant_id") WHERE "tenant"."courier_parcels"."fee_held" > 0 AND "tenant"."courier_parcels"."settled_at" IS NULL AND "tenant"."courier_parcels"."state" IN ('booking', 'booked', 'unknown');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courier_parcels_unsettled_idx" ON "tenant"."courier_parcels" USING btree ("tenant_id","created_at") WHERE "tenant"."courier_parcels"."settled_at" IS NULL AND "tenant"."courier_parcels"."state" IN ('booking', 'booked', 'unknown');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courier_parcels_consignment_idx" ON "tenant"."courier_parcels" USING btree ("tenant_id","courier_key","consignment_id");--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written security (not expressible in Drizzle). Phase 6 Slice 6.1, read agreed 2026-11-04.
-- ---------------------------------------------------------------------------------------------

-- CRR-02 to CRR-08, SEC-11: a shop's courier connections, its parcels and its log of credential uses, each only ever its own.
ALTER TABLE tenant.courier_connections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.courier_connections FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.courier_connections USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
ALTER TABLE tenant.courier_parcels ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.courier_parcels FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.courier_parcels USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
ALTER TABLE tenant.courier_credential_uses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.courier_credential_uses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.courier_credential_uses USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.courier_connections TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.courier_parcels TO lytronix_app;
    -- The log is only ever added to and read, and goes with the shop at day 60.
    GRANT SELECT, INSERT, DELETE ON tenant.courier_credential_uses TO lytronix_app;
  END IF;
END $$;
