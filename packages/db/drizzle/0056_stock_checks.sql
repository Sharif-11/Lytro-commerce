CREATE TABLE IF NOT EXISTS "tenant"."stock_check_lines" (
	"tenant_id" uuid NOT NULL,
	"check_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"expected" numeric(14, 3) NOT NULL,
	"counted" numeric(14, 3) NOT NULL,
	"unit_cost" numeric(12, 4),
	"movement_id" bigint,
	CONSTRAINT "stock_check_lines_tenant_id_check_id_variant_id_pk" PRIMARY KEY("tenant_id","check_id","variant_id"),
	CONSTRAINT "stock_check_lines_expected_check" CHECK ("tenant"."stock_check_lines"."expected" >= 0),
	CONSTRAINT "stock_check_lines_counted_check" CHECK ("tenant"."stock_check_lines"."counted" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."stock_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"note" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_checks_tenant_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."stock_check_lines" ADD CONSTRAINT "stock_check_lines_check_fk" FOREIGN KEY ("tenant_id","check_id") REFERENCES "tenant"."stock_checks"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_checks_tenant_created_idx" ON "tenant"."stock_checks" USING btree ("tenant_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written security and grants (not expressible in Drizzle). Reviewed with the schema above.
-- DATABASE-SCHEMA §3.2 (inventory), Phase 3 Slice 2b.
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_checks', 'stock_check_lines']
  LOOP
    EXECUTE format('ALTER TABLE tenant.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE tenant.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON tenant.%I USING (tenant_id = tenant.current_tenant_id()) '
      'WITH CHECK (tenant_id = tenant.current_tenant_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- INV-07: a check records what was counted and is never changed, so the application role holds no UPDATE. DELETE is
-- for LIF-19's day-60 deletion of a lapsed shop's data only.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, DELETE ON tenant.stock_checks, tenant.stock_check_lines TO lytronix_app;
  END IF;
END $$;
