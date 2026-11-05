CREATE TABLE IF NOT EXISTS "tenant"."courier_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"parcel_id" uuid,
	"courier_key" text NOT NULL,
	"source" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"raw_status" varchar(100),
	"reading" text,
	"message_en" varchar(500),
	"message_bn" varchar(500),
	"happened_at" timestamp with time zone,
	"news" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	"problem" text,
	CONSTRAINT "courier_events_dedupe_key" UNIQUE("tenant_id","courier_key","dedupe_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."courier_message_routes" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"courier_key" text NOT NULL,
	"connection_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courier_message_routes_connection_id_unique" UNIQUE("connection_id")
);
--> statement-breakpoint
ALTER TABLE "tenant"."courier_connections" ADD COLUMN "message_secrets" "bytea";--> statement-breakpoint
ALTER TABLE "tenant"."courier_connections" ADD COLUMN "last_message_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant"."courier_connections" ADD COLUMN "unsigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant"."courier_connections" ADD COLUMN "paste_warned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant"."courier_parcels" ADD COLUMN "reading" text;--> statement-breakpoint
ALTER TABLE "tenant"."courier_parcels" ADD COLUMN "last_news_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant"."courier_parcels" ADD COLUMN "last_change_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant"."courier_parcels" ADD COLUMN "last_message_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant"."courier_parcels" ADD COLUMN "last_check_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant"."courier_parcels" ADD COLUMN "checks_stopped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant"."courier_parcels" ADD COLUMN "cash_collected" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "tenant"."courier_parcels" ADD COLUMN "cod_at_courier" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "tenant"."courier_parcels" ADD COLUMN "attention" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."courier_events" ADD CONSTRAINT "courier_events_parcel_id_courier_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "tenant"."courier_parcels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courier_events_parcel_idx" ON "tenant"."courier_events" USING btree ("parcel_id","received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courier_events_unapplied_idx" ON "tenant"."courier_events" USING btree ("tenant_id","received_at") WHERE "tenant"."courier_events"."applied_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courier_parcels_night_idx" ON "tenant"."courier_parcels" USING btree ("tenant_id","created_at") WHERE "tenant"."courier_parcels"."state" = 'booked' AND "tenant"."courier_parcels"."settled_at" IS NOT NULL AND "tenant"."courier_parcels"."checks_stopped_at" IS NULL AND ("tenant"."courier_parcels"."reading" IS NULL OR "tenant"."courier_parcels"."reading" NOT IN ('delivered', 'partly_delivered', 'returning'));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courier_parcels_invoice_idx" ON "tenant"."courier_parcels" USING btree ("tenant_id","courier_key","invoice");--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written security and settings (not expressible in Drizzle). Phase 6 Slice 6.2, read agreed 2026-11-05.
-- ---------------------------------------------------------------------------------------------

-- CRR-12, CRR-13: a shop's courier news, only ever its own.
ALTER TABLE tenant.courier_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.courier_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.courier_events USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.courier_events TO lytronix_app;
    -- CRR-11: read before any tenant context exists, so it holds only a hash and whose it is.
    GRANT SELECT, INSERT, DELETE ON control.courier_message_routes TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- CRR-14, CRR-15, D6-4: keeping calls to couriers down, changed in operator settings.
INSERT INTO control.platform_settings (key, value, description) VALUES
  ('courier_check_min_age_hours', '6', 'How many hours old a parcel must be before the night check asks after it (CRR-15).'),
  ('courier_check_quiet_hours', '24', 'How many hours without a courier message before the night check asks after a parcel (CRR-15).'),
  ('courier_check_stop_days', '30', 'How many days with no change before a parcel stops being checked and shows no news (CRR-15).'),
  ('courier_sync_minutes', '10', 'How many minutes a Sync shows its saved answer before it may ask the courier again (CRR-14).')
ON CONFLICT (key) DO NOTHING;
