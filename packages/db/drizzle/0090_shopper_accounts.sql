CREATE TABLE IF NOT EXISTS "tenant"."shopper_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"shopper_id" uuid NOT NULL,
	"label" varchar(30) NOT NULL,
	"location_id" integer NOT NULL,
	"delivery_address" varchar(500) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."shopper_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"phone" varchar(15) NOT NULL,
	"code_hash" text NOT NULL,
	"wrong_attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."shopper_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"shopper_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."shoppers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"phone" varchar(15) NOT NULL,
	"name" varchar(100) NOT NULL,
	"password_hash" text NOT NULL,
	"failed_signins" integer DEFAULT 0 NOT NULL,
	"failing_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shoppers_tenant_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."shopper_addresses" ADD CONSTRAINT "shopper_addresses_shopper_fk" FOREIGN KEY ("tenant_id","shopper_id") REFERENCES "tenant"."shoppers"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."shopper_sessions" ADD CONSTRAINT "shopper_sessions_shopper_fk" FOREIGN KEY ("tenant_id","shopper_id") REFERENCES "tenant"."shoppers"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shopper_addresses_shopper_idx" ON "tenant"."shopper_addresses" USING btree ("tenant_id","shopper_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shopper_addresses_default_key" ON "tenant"."shopper_addresses" USING btree ("tenant_id","shopper_id") WHERE "tenant"."shopper_addresses"."is_default";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shopper_codes_phone_idx" ON "tenant"."shopper_codes" USING btree ("tenant_id","phone","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shopper_codes_tenant_idx" ON "tenant"."shopper_codes" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shopper_sessions_token_key" ON "tenant"."shopper_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shopper_sessions_shopper_idx" ON "tenant"."shopper_sessions" USING btree ("tenant_id","shopper_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shoppers_phone_key" ON "tenant"."shoppers" USING btree ("tenant_id","phone");
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written isolation and grants (not expressible in Drizzle). Phase 4 Slice 4.4b, D4-14, agreed 2026-10-30.
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['shoppers', 'shopper_sessions', 'shopper_codes', 'shopper_addresses']
  LOOP
    EXECUTE format('ALTER TABLE tenant.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE tenant.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON tenant.%I USING (tenant_id = tenant.current_tenant_id()) '
      'WITH CHECK (tenant_id = tenant.current_tenant_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- The application role makes, changes and removes all of these: a shopper's account and addresses, their sign-ins
-- (ended by signing out or a new password), and the codes (used once).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.shoppers, tenant.shopper_sessions, tenant.shopper_codes,
      tenant.shopper_addresses TO lytronix_app;
  END IF;
END $$;
