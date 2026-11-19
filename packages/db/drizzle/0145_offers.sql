-- OFFERS-PLAN (the owner, 2026-11-18 and 19): named price cuts on chosen products or designs. Kind: add -- three new
-- tables, no data moved. The previous release neither reads nor writes any of them; prices an offer set stay on the
-- variants as ordinary prices if it is redeployed (OFFERS-PLAN 4.2).
CREATE TABLE "tenant"."offer_items" (
	"tenant_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"design_option_id" uuid
);
--> statement-breakpoint
CREATE TABLE "tenant"."offer_prices" (
	"tenant_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"price_before" numeric(10, 2),
	"regular_before" numeric(10, 2),
	"price_at_start" numeric(10, 2) NOT NULL,
	"offer_price" numeric(10, 2) NOT NULL,
	CONSTRAINT "offer_prices_tenant_id_variant_id_pk" PRIMARY KEY("tenant_id","variant_id")
);
--> statement-breakpoint
CREATE TABLE "tenant"."offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"slug" text NOT NULL,
	"cut_kind" text NOT NULL,
	"cut_amount" integer NOT NULL,
	"state" text NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offers_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "offers_tenant_slug_unique" UNIQUE("tenant_id","slug")
);
--> statement-breakpoint
CREATE INDEX "offer_items_product_idx" ON "tenant"."offer_items" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE INDEX "offer_prices_offer_idx" ON "tenant"."offer_prices" USING btree ("tenant_id","offer_id");--> statement-breakpoint
CREATE INDEX "offers_tenant_state_idx" ON "tenant"."offers" USING btree ("tenant_id","state");
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written: row-level security, the checks, one row per product and design in an offer, the keys, and grants
-- (not expressible in Drizzle).
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
ALTER TABLE tenant.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.offers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant.offers
  USING (tenant_id = tenant.current_tenant_id()) WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
ALTER TABLE tenant.offer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.offer_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant.offer_items
  USING (tenant_id = tenant.current_tenant_id()) WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
ALTER TABLE tenant.offer_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.offer_prices FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant.offer_prices
  USING (tenant_id = tenant.current_tenant_id()) WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
-- OF-14: made ready, running or ended; OF-2, OF-18: a percent from 1 to 90, or whole taka from 1.
ALTER TABLE tenant.offers ADD CONSTRAINT offers_state_check CHECK (state IN ('waiting', 'running', 'ended'));
--> statement-breakpoint
ALTER TABLE tenant.offers ADD CONSTRAINT offers_cut_check CHECK (
  (cut_kind = 'percent' AND cut_amount BETWEEN 1 AND 90) OR (cut_kind = 'taka' AND cut_amount >= 1)
);
--> statement-breakpoint
-- OF-18: no size sells below one taka in an offer.
ALTER TABLE tenant.offer_prices ADD CONSTRAINT offer_prices_offer_price_check CHECK (offer_price >= 1);
--> statement-breakpoint
-- OF-9: a product, and one of its designs or none, once per offer (no design counted as one value).
CREATE UNIQUE INDEX offer_items_item_idx
  ON tenant.offer_items (tenant_id, offer_id, product_id, design_option_id) NULLS NOT DISTINCT;
--> statement-breakpoint
-- DAT-02: an offer's products, designs and sizes are the shop's own; erasing one takes it out of the offer. An offer
-- deleted takes what it holds with it.
ALTER TABLE tenant.offer_items ADD CONSTRAINT offer_items_offer_fk
  FOREIGN KEY (tenant_id, offer_id) REFERENCES tenant.offers (tenant_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE tenant.offer_items ADD CONSTRAINT offer_items_product_fk
  FOREIGN KEY (tenant_id, product_id) REFERENCES tenant.products (tenant_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE tenant.offer_items ADD CONSTRAINT offer_items_design_fk
  FOREIGN KEY (tenant_id, design_option_id) REFERENCES tenant.attribute_options (tenant_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE tenant.offer_prices ADD CONSTRAINT offer_prices_offer_fk
  FOREIGN KEY (tenant_id, offer_id) REFERENCES tenant.offers (tenant_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE tenant.offer_prices ADD CONSTRAINT offer_prices_variant_fk
  FOREIGN KEY (tenant_id, variant_id) REFERENCES tenant.product_variants (tenant_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE tenant.offer_prices ADD CONSTRAINT offer_prices_product_fk
  FOREIGN KEY (tenant_id, product_id) REFERENCES tenant.products (tenant_id, id) ON DELETE CASCADE;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.offers TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.offer_items TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.offer_prices TO lytronix_app;
  END IF;
END $$;
