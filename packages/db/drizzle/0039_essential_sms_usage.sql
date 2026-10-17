CREATE TABLE IF NOT EXISTS "control"."essential_sms_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"parts" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."essential_sms_usage" ADD CONSTRAINT "essential_sms_usage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "essential_sms_usage_tenant_idx" ON "control"."essential_sms_usage" USING btree ("tenant_id","created_at");
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT ON control.essential_sms_usage TO lytronix_app;
  END IF;
END $$;