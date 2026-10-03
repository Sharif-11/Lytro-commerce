CREATE SCHEMA "control";
--> statement-breakpoint
CREATE SCHEMA "tenant";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."platform_audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" uuid,
	"result" text NOT NULL,
	"ip" "inet",
	"summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- DAT-10 / AUD-03: the audit log is insert-only at the database level, whatever role connects.
CREATE OR REPLACE FUNCTION control.reject_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'control.platform_audit_log is insert-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER platform_audit_log_insert_only
  BEFORE UPDATE OR DELETE ON control.platform_audit_log
  FOR EACH ROW EXECUTE FUNCTION control.reject_audit_mutation();
--> statement-breakpoint
-- DAT-03 / TEN-24: tenant id for row-level security. NULL when unset, so a query without tenant context matches no rows.
CREATE OR REPLACE FUNCTION tenant.current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$;
