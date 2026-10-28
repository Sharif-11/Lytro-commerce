-- INV-07, Slice 11.9: each shop's stock checks carry the shop's own number (#12), given from a counter row the way
-- PUR-03 numbers purchases: locked by the statement that takes the next one, so numbers never repeat or skip.
CREATE TABLE IF NOT EXISTS "tenant"."stock_check_counters" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE tenant.stock_check_counters ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE tenant.stock_check_counters FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.stock_check_counters
  USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());--> statement-breakpoint
ALTER TABLE "tenant"."stock_checks" ADD COLUMN "number" integer;--> statement-breakpoint
-- The checks a shop already has are numbered 1, 2, 3 in the order they were saved, and its counter starts after the
-- last. Shop by shop, since row-level security is forced on these tables.
DO $$
DECLARE
  shop uuid;
BEGIN
  FOR shop IN SELECT id FROM control.tenants LOOP
    PERFORM set_config('app.tenant_id', shop::text, true);
    UPDATE tenant.stock_checks c SET number = n.number
    FROM (
      SELECT id, (row_number() OVER (ORDER BY created_at, id))::int AS number
      FROM tenant.stock_checks
      WHERE tenant_id = shop
    ) n
    WHERE c.tenant_id = shop AND c.id = n.id;
    INSERT INTO tenant.stock_check_counters (tenant_id, last_number)
    SELECT shop, max(number) FROM tenant.stock_checks WHERE tenant_id = shop
    HAVING count(*) > 0;
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END $$;
--> statement-breakpoint
ALTER TABLE "tenant"."stock_checks" ALTER COLUMN "number" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stock_checks_tenant_number_idx" ON "tenant"."stock_checks" USING btree ("tenant_id","number");--> statement-breakpoint
-- The application role takes numbers and, for LIF-19's day-60 deletion, removes a lapsed shop's counter.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.stock_check_counters TO lytronix_app;
  END IF;
END $$;
