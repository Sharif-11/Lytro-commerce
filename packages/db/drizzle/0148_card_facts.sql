-- SB-10 (the owner, 2026-11-20): a storefront card's "ordered" and best-seller facts kept per shop, worked out again by
-- the minute tick within 5 minutes of the shop's orders changing, so a product list stops going through the shop's
-- orders on every page (68-86% of the database's time in staging's load runs). Kind: add -- two new tables, no data
-- moved. The previous release neither reads nor writes either; a list of the new release reads a shop's facts live, as
-- before, until the tick has worked them out (and again whenever they are more than a day old).
CREATE TABLE "tenant"."card_fact_runs" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"worked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant"."product_card_facts" (
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"ordered" integer NOT NULL,
	"best_seller" boolean DEFAULT false NOT NULL,
	CONSTRAINT "product_card_facts_tenant_id_product_id_pk" PRIMARY KEY("tenant_id","product_id")
);
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written: row-level security, the check, the keys, and grants (not expressible in Drizzle).
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
ALTER TABLE tenant.card_fact_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.card_fact_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant.card_fact_runs
  USING (tenant_id = tenant.current_tenant_id()) WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
ALTER TABLE tenant.product_card_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.product_card_facts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant.product_card_facts
  USING (tenant_id = tenant.current_tenant_id()) WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
-- A product has a row only once it was ordered (a missing one reads as never ordered).
ALTER TABLE tenant.product_card_facts ADD CONSTRAINT product_card_facts_ordered_check CHECK (ordered > 0);
--> statement-breakpoint
-- DAT-02: the facts are of the shop's own product; erasing it takes them with it.
ALTER TABLE tenant.product_card_facts ADD CONSTRAINT product_card_facts_product_fk
  FOREIGN KEY (tenant_id, product_id) REFERENCES tenant.products (tenant_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE tenant.card_fact_runs ADD CONSTRAINT card_fact_runs_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES control.tenants (id) ON DELETE CASCADE;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.card_fact_runs TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.product_card_facts TO lytronix_app;
  END IF;
END $$;
