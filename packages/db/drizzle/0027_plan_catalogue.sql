CREATE TABLE IF NOT EXISTS "control"."plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"rank" integer NOT NULL,
	"for_sale" boolean NOT NULL,
	"limits" jsonb NOT NULL,
	"features" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_versions_plan_version_key" UNIQUE("plan_id","version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."billing_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label_bn" text NOT NULL,
	"label_en" text NOT NULL,
	"months" integer NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"default_discount_pct" numeric(5, 2),
	"tenant_id" uuid,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_terms_months_check" CHECK ("control"."billing_terms"."months" BETWEEN 1 AND 60)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."plan_prices" (
	"plan_id" uuid NOT NULL,
	"billing_term_id" uuid NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	CONSTRAINT "plan_prices_plan_id_billing_term_id_pk" PRIMARY KEY("plan_id","billing_term_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."plan_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"expiry" timestamp with time zone,
	"reason" text NOT NULL,
	"assigned_by" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."plan_limit_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"limit_key" text NOT NULL,
	"value" jsonb NOT NULL,
	"reason" text NOT NULL,
	"set_by" uuid NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_limit_overrides_tenant_key_key" UNIQUE("tenant_id","limit_key")
);
--> statement-breakpoint
ALTER TABLE "control"."plans" ADD COLUMN "description" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."plan_versions" ADD CONSTRAINT "plan_versions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "control"."plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."billing_terms" ADD CONSTRAINT "billing_terms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."plan_prices" ADD CONSTRAINT "plan_prices_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "control"."plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."plan_prices" ADD CONSTRAINT "plan_prices_billing_term_id_billing_terms_id_fk" FOREIGN KEY ("billing_term_id") REFERENCES "control"."billing_terms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."plan_assignments" ADD CONSTRAINT "plan_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."plan_assignments" ADD CONSTRAINT "plan_assignments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "control"."plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."plan_limit_overrides" ADD CONSTRAINT "plan_limit_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Application role grants (control-schema, no RLS -- platform-wide data).
-- ---------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    -- Migration 0001 granted only SELECT on control.plans (plans were seed-data-only until now);
    -- the operator plan editor (PLN-01/02) needs to create and edit them too.
    GRANT INSERT, UPDATE, DELETE ON control.plans TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.billing_terms, control.plan_prices TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE ON control.plan_versions, control.plan_assignments,
      control.plan_limit_overrides TO lytronix_app;
    GRANT DELETE ON control.plan_limit_overrides TO lytronix_app;
  END IF;
END $$;
