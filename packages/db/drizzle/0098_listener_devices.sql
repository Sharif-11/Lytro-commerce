CREATE TYPE "control"."listener_revoke_reason" AS ENUM('owner', 'operator', 'flags', 'installation_blocked');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."listener_blocked_installations" (
	"installation_id" varchar(100) PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"blocked_by" uuid,
	"blocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."listener_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"model" varchar(100),
	"app_version" varchar(20) NOT NULL,
	"installation_id" varchar(100) NOT NULL,
	"token_hash" char(64) NOT NULL,
	"paired_by" uuid,
	"paired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"flags" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"revoke_reason" "control"."listener_revoke_reason",
	CONSTRAINT "listener_devices_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."listener_pairing_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code_hash" char(64) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"tries" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "listener_pairing_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."listener_devices" ADD CONSTRAINT "listener_devices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."listener_pairing_codes" ADD CONSTRAINT "listener_pairing_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listener_devices_tenant_idx" ON "control"."listener_devices" USING btree ("tenant_id","paired_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listener_devices_installation_idx" ON "control"."listener_devices" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listener_devices_revoked_idx" ON "control"."listener_devices" USING btree ("revoked_at") WHERE "control"."listener_devices"."revoked_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listener_pairing_codes_tenant_idx" ON "control"."listener_pairing_codes" USING btree ("tenant_id","created_at");
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written grants and data (not expressible in Drizzle). Phase 5 Slice 5.4a, read agreed 2026-11-01.
-- ---------------------------------------------------------------------------------------------

-- The application role makes and spends pairing codes, pairs, renames, flags and revokes devices, and the purge and
-- the day-60 deletion remove them; Lytro's blocks are added and read.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.listener_pairing_codes TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.listener_devices TO lytronix_app;
    GRANT SELECT, INSERT ON control.listener_blocked_installations TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- LSN-08 (2.1): Growth pairs 2 listener phones and Pro 5, where those plans exist; Trial, Starter and Pay-as-you-go
-- (1, agreed 2026-11-01) already say so.
UPDATE control.plans p
SET limits = p.limits || v.extra
FROM (VALUES
  ('Growth', '{"paired_devices": 2}'::jsonb),
  ('Pro', '{"paired_devices": 5}'::jsonb)
) AS v(name, extra)
WHERE p.name = v.name;
--> statement-breakpoint
-- PLN-05: a shop's frozen limits gain the figure from its own plan where they had none, so it is read from the
-- snapshot, never a default in code.
UPDATE control.tenants t
SET plan_snapshot = t.plan_snapshot || jsonb_build_object('paired_devices', p.limits -> 'paired_devices')
FROM control.plans p
WHERE t.plan_id = p.id
  AND p.limits ? 'paired_devices'
  AND t.plan_snapshot IS NOT NULL
  AND NOT (t.plan_snapshot ? 'paired_devices');
