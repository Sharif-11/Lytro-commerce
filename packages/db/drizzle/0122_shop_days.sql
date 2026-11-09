CREATE TABLE IF NOT EXISTS "control"."shop_days" (
	"tenant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"state" text NOT NULL,
	"plan_id" uuid,
	"storage_bytes" bigint DEFAULT 0 NOT NULL,
	"sms_units" integer DEFAULT 0 NOT NULL,
	"spend" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"given_back" numeric(12, 2) DEFAULT '0' NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_days_tenant_id_day_pk" PRIMARY KEY("tenant_id","day")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."shop_days" ADD CONSTRAINT "shop_days_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shop_days_day_idx" ON "control"."shop_days" USING btree ("day");
--> statement-breakpoint
-- ADM-09, D8-9 (Phase 8 Slice 8.4): the night writes each shop's day and may write it again (a repeated run replaces
-- its rows); the reports read it. A shop's deletion takes its rows with it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE ON control.shop_days TO lytronix_app;
  END IF;
END $$;
