CREATE TYPE "control"."api_key_type" AS ENUM('public');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" "control"."api_key_type" DEFAULT 'public' NOT NULL,
	"name" varchar(80) NOT NULL,
	"prefix" varchar(24) NOT NULL,
	"key_hash" char(64) NOT NULL,
	"websites" text[] NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."api_usage" (
	"tenant_id" uuid NOT NULL,
	"cycle_start" timestamp with time zone NOT NULL,
	"requests" bigint DEFAULT 0 NOT NULL,
	"warned_percent" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_usage_pkey" PRIMARY KEY("tenant_id","cycle_start")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."api_keys" ADD CONSTRAINT "api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."api_usage" ADD CONSTRAINT "api_usage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_tenant_idx" ON "control"."api_keys" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_websites_idx" ON "control"."api_keys" USING gin ("websites") WHERE "control"."api_keys"."revoked_at" IS NULL;--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written grants and data (not expressible in Drizzle). Reviewed with the schema above.
-- DATABASE-SCHEMA §2 (control), Phase 3 Slice 8: public API keys and request limits (API-01 to API-05, API-08,
-- API-23, RTE-01, RTE-03, RTE-10).
-- ---------------------------------------------------------------------------------------------

-- The application role makes, reads, edits and revokes keys and counts requests; it deletes them only at LIF-19's
-- day-60 deletion.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.api_keys TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.api_usage TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- RTE-01, RTE-03 (2.1): requests a public key may make per minute, and a shop's keys per billing cycle, on each plan.
-- A plan an operator made is given Trial's figures until the operator sets its own.
UPDATE control.plans p
SET limits = p.limits || v.extra
FROM (VALUES
  ('Trial', '{"requests_per_minute_public": 60, "requests_monthly": 20000}'::jsonb),
  ('Pay-as-you-go', '{"requests_per_minute_public": 60, "requests_monthly": 100000}'::jsonb),
  ('Starter', '{"requests_per_minute_public": 60, "requests_monthly": 200000}'::jsonb),
  ('Growth', '{"requests_per_minute_public": 180, "requests_monthly": 600000}'::jsonb),
  ('Pro', '{"requests_per_minute_public": 600, "requests_monthly": 2000000}'::jsonb)
) AS v(name, extra)
WHERE p.name = v.name;
--> statement-breakpoint
UPDATE control.plans
SET limits = limits || '{"requests_per_minute_public": 60, "requests_monthly": 20000}'::jsonb
WHERE NOT (limits ? 'requests_per_minute_public') OR NOT (limits ? 'requests_monthly');
--> statement-breakpoint
-- PLN-05, RTE-10: a shop's frozen limits gain the two new ones from its own plan, so every limit is read from the
-- snapshot and overrides, never a default in code.
UPDATE control.tenants t
SET plan_snapshot = t.plan_snapshot
  || CASE WHEN t.plan_snapshot ? 'requests_per_minute_public' THEN '{}'::jsonb
          ELSE jsonb_build_object('requests_per_minute_public', p.limits -> 'requests_per_minute_public') END
  || CASE WHEN t.plan_snapshot ? 'requests_monthly' THEN '{}'::jsonb
          ELSE jsonb_build_object('requests_monthly', p.limits -> 'requests_monthly') END
FROM control.plans p
WHERE p.id = t.plan_id AND t.plan_snapshot IS NOT NULL;
