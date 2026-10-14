CREATE TABLE IF NOT EXISTS "control"."scheduled_plan_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"target_plan_id" uuid,
	"effective_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_plan_changes_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."scheduled_plan_changes" ADD CONSTRAINT "scheduled_plan_changes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."scheduled_plan_changes" ADD CONSTRAINT "scheduled_plan_changes_target_plan_id_plans_id_fk" FOREIGN KEY ("target_plan_id") REFERENCES "control"."plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Application role grants (control-schema, no RLS -- platform-wide data), same pattern as 0027/0029.
-- ---------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.scheduled_plan_changes TO lytronix_app;
  END IF;
END $$;
