-- WAL-05 (amended 2026-11-04, Slice 5.8's part 1): a method starts off until the owner turns it on, so a new shop's
-- Payment methods page opens with nothing on, as it is drawn. A row now means on.
CREATE TABLE IF NOT EXISTS "tenant"."payment_methods_on" (
	"tenant_id" uuid NOT NULL,
	"method" "tenant"."payment_method" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_methods_on_tenant_id_method_pk" PRIMARY KEY("tenant_id","method")
);
--> statement-breakpoint
-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
ALTER TABLE tenant.payment_methods_on ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.payment_methods_on FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.payment_methods_on
  USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, DELETE ON tenant.payment_methods_on TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- A method that already has accounts and wasn't switched off stays on; one with none starts off like a new shop's. Shop
-- by shop, since row-level security is forced on roles.
DO $$
DECLARE
  shop uuid;
BEGIN
  FOR shop IN SELECT id FROM control.tenants LOOP
    PERFORM set_config('app.tenant_id', shop::text, true);
    INSERT INTO tenant.payment_methods_on (tenant_id, method)
    SELECT DISTINCT account.tenant_id, account.method
    FROM tenant.wallet_accounts account
    WHERE account.tenant_id = shop
      AND NOT EXISTS (
        SELECT 1 FROM tenant.payment_methods_off off_row
        WHERE off_row.tenant_id = account.tenant_id AND off_row.method = account.method
      );
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END $$;
--> statement-breakpoint
DROP TABLE tenant.payment_methods_off;
