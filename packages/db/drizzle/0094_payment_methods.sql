CREATE TYPE "tenant"."wallet_account_type" AS ENUM('personal', 'agent', 'merchant');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."payment_methods_off" (
	"tenant_id" uuid NOT NULL,
	"method" "tenant"."payment_method" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_methods_off_tenant_id_method_pk" PRIMARY KEY("tenant_id","method")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."wallet_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"method" "tenant"."payment_method" NOT NULL,
	"account_name" varchar(100) NOT NULL,
	"number" varchar(12),
	"account_type" "tenant"."wallet_account_type",
	"note" varchar(500),
	"bank_name" varchar(100),
	"account_number" varchar(100),
	"branch" varchar(100),
	"routing_number" varchar(100),
	"swift_code" varchar(100),
	"instructions" varchar(500),
	"active" boolean DEFAULT false NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_accounts_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "wallet_accounts_method_check" CHECK ("tenant"."wallet_accounts"."method" NOT IN ('cash', 'cash_on_delivery')),
	CONSTRAINT "wallet_accounts_kind_check" CHECK (CASE WHEN "tenant"."wallet_accounts"."method" = 'bank'
        THEN "tenant"."wallet_accounts"."bank_name" IS NOT NULL AND "tenant"."wallet_accounts"."account_number" IS NOT NULL AND "tenant"."wallet_accounts"."number" IS NULL
          AND "tenant"."wallet_accounts"."account_type" IS NULL
        ELSE "tenant"."wallet_accounts"."number" IS NOT NULL AND "tenant"."wallet_accounts"."account_type" IS NOT NULL AND "tenant"."wallet_accounts"."bank_name" IS NULL
          AND "tenant"."wallet_accounts"."account_number" IS NULL AND "tenant"."wallet_accounts"."branch" IS NULL AND "tenant"."wallet_accounts"."routing_number" IS NULL
          AND "tenant"."wallet_accounts"."swift_code" IS NULL AND "tenant"."wallet_accounts"."instructions" IS NULL END)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_accounts_active_key" ON "tenant"."wallet_accounts" USING btree ("tenant_id","method") WHERE "tenant"."wallet_accounts"."active";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_accounts_number_key" ON "tenant"."wallet_accounts" USING btree ("tenant_id","method","number") WHERE "tenant"."wallet_accounts"."number" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_accounts_account_number_key" ON "tenant"."wallet_accounts" USING btree ("tenant_id","method",lower("account_number")) WHERE "tenant"."wallet_accounts"."account_number" IS NOT NULL;
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written isolation and grants (not expressible in Drizzle). Phase 5 Slice 5.1, WAL-01 to WAL-17, agreed 2026-10-31.
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['wallet_accounts', 'payment_methods_off']
  LOOP
    EXECUTE format('ALTER TABLE tenant.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE tenant.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON tenant.%I USING (tenant_id = tenant.current_tenant_id()) '
      'WITH CHECK (tenant_id = tenant.current_tenant_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- The application role replaces a method's accounts whole when the owner saves them, and switches a method off or on.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.wallet_accounts TO lytronix_app;
    GRANT SELECT, INSERT, DELETE ON tenant.payment_methods_off TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- WAL-07, STF-07 (amended 2026-10-31): changing where shoppers pay is the owner's alone, so no role keeps
-- wallets:manage. Shop by shop, since row-level security is forced on roles.
DO $$
DECLARE
  shop uuid;
BEGIN
  FOR shop IN SELECT id FROM control.tenants LOOP
    PERFORM set_config('app.tenant_id', shop::text, true);
    UPDATE tenant.roles SET permissions = array_remove(permissions, 'wallets:manage')
    WHERE tenant_id = shop AND 'wallets:manage' = ANY (permissions);
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END $$;
