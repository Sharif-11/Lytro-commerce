CREATE TYPE "control"."identity_kind" AS ENUM('phone', 'email', 'facebook');--> statement-breakpoint
CREATE TYPE "control"."tenant_state" AS ENUM('trial', 'pay_as_you_go', 'active', 'grace', 'read_only', 'locked', 'archived', 'deleted');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."activity_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" uuid,
	"result" text NOT NULL,
	"summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"rank" integer NOT NULL,
	"for_sale" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"limits" jsonb NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"permissions" text[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "roles_tenant_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"csrf_hash" text NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent" text,
	"ip" "inet",
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."subscriber_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"kind" "control"."identity_kind" NOT NULL,
	"value" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sign_in_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."tenant_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_domains_hostname_unique" UNIQUE("hostname"),
	CONSTRAINT "tenant_domains_status_check" CHECK ("control"."tenant_domains"."status" in ('pending','active','failed','removed'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_identity_id" uuid NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"cell_id" integer DEFAULT 1 NOT NULL,
	"shop_name" varchar(60) NOT NULL,
	"slug" varchar(30) NOT NULL,
	"state" "control"."tenant_state" DEFAULT 'trial' NOT NULL,
	"plan_id" uuid,
	"plan_snapshot" jsonb,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"balance_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"balance_frozen" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"suspended_at" timestamp with time zone,
	"suspended_reason" text,
	"kyc_status" text DEFAULT 'unverified' NOT NULL,
	CONSTRAINT "tenants_owner_identity_id_unique" UNIQUE("owner_identity_id"),
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tenants_kyc_status_check" CHECK ("control"."tenants"."kyc_status" in ('unverified','pending','verified','revoked'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."user_roles" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "user_roles_tenant_id_user_id_role_id_pk" PRIMARY KEY("tenant_id","user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"phone" varchar(15) NOT NULL,
	"password_hash" text,
	"name" text,
	"is_owner" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_tenant_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."sessions" ADD CONSTRAINT "sessions_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "control"."subscribers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."sessions" ADD CONSTRAINT "sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."subscriber_identities" ADD CONSTRAINT "subscriber_identities_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "control"."subscribers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."tenant_domains" ADD CONSTRAINT "tenant_domains_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."tenants" ADD CONSTRAINT "tenants_owner_identity_id_subscriber_identities_id_fk" FOREIGN KEY ("owner_identity_id") REFERENCES "control"."subscriber_identities"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."tenants" ADD CONSTRAINT "tenants_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "control"."subscribers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."tenants" ADD CONSTRAINT "tenants_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "control"."plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."user_roles" ADD CONSTRAINT "user_roles_tenant_id_user_id_users_tenant_id_id_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "tenant"."users"("tenant_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."user_roles" ADD CONSTRAINT "user_roles_tenant_id_role_id_roles_tenant_id_id_fk" FOREIGN KEY ("tenant_id","role_id") REFERENCES "tenant"."roles"("tenant_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_tenant_created_idx" ON "tenant"."activity_log" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plans_rank_for_sale_idx" ON "control"."plans" USING btree ("rank") WHERE "control"."plans"."for_sale";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roles_tenant_name_idx" ON "tenant"."roles" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_subscriber_idx" ON "control"."sessions" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_tenant_idx" ON "control"."sessions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_expires_idx" ON "control"."sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscriber_identities_kind_value_idx" ON "control"."subscriber_identities" USING btree ("kind","value");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriber_identities_subscriber_idx" ON "control"."subscriber_identities" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_domains_tenant_idx" ON "control"."tenant_domains" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenants_subscriber_idx" ON "control"."tenants" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenants_state_idx" ON "control"."tenants" USING btree ("state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenants_cell_idx" ON "control"."tenants" USING btree ("cell_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_tenant_phone_idx" ON "tenant"."users" USING btree ("tenant_id","phone");--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written security (not expressible in Drizzle). Reviewed with the schema above.
-- ---------------------------------------------------------------------------------------------

-- DAT-03 / TEN-24: row-level security on every tenant table. FORCE makes it apply to the table
-- owner as well, so only a superuser or a role with BYPASSRLS can see across tenants.
ALTER TABLE "tenant"."users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenant"."users" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tenant"."users"
  USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "tenant"."roles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenant"."roles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tenant"."roles"
  USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "tenant"."user_roles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenant"."user_roles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tenant"."user_roles"
  USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "tenant"."activity_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenant"."activity_log" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tenant"."activity_log"
  USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
-- DAT-10 / AUD-03: the tenant activity log is insert-only, whatever role connects.
CREATE OR REPLACE FUNCTION tenant.reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is insert-only', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER activity_log_insert_only
  BEFORE UPDATE OR DELETE ON "tenant"."activity_log"
  FOR EACH ROW EXECUTE FUNCTION tenant.reject_mutation();
--> statement-breakpoint
-- Application role grants. The role itself is created once per environment by
-- scripts/db/create-app-role.sql (it needs superuser rights, so it is not part of a migration).
-- Each migration that adds a table must add its grants here, since a missing grant fails closed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT USAGE ON SCHEMA control, tenant TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE ON control.subscribers, control.tenants, control.tenant_domains,
      control.platform_settings TO lytronix_app;
    GRANT SELECT ON control.plans TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.subscriber_identities, control.sessions TO lytronix_app;
    GRANT SELECT, INSERT ON control.platform_audit_log TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.users, tenant.roles, tenant.user_roles TO lytronix_app;
    GRANT SELECT, INSERT ON tenant.activity_log TO lytronix_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA control, tenant TO lytronix_app;
    GRANT EXECUTE ON FUNCTION tenant.current_tenant_id() TO lytronix_app;
  END IF;
END $$;
