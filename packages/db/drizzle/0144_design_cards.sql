-- STOREFRONT-BUILDER-PLAN DC-2, DC-6 (the owner, 2026-11-18): each design of a product its own card in the shop's
-- lists, on unless the shop turns it off, the seller's order of the cards, and per product its designs as cards, one
-- card, or both (DC-8). Kind: add -- two new tables and a defaulted column, no data moved. The previous release neither
-- reads nor writes any of them.
CREATE TABLE "tenant"."storefront_card_positions" (
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"design_option_id" uuid,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant"."storefront_product_cards" (
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"mode" text NOT NULL,
	CONSTRAINT "storefront_product_cards_tenant_id_product_id_pk" PRIMARY KEY("tenant_id","product_id")
);
--> statement-breakpoint
ALTER TABLE "tenant"."storefront_designs" ADD COLUMN "design_cards" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "storefront_card_positions_product_idx" ON "tenant"."storefront_card_positions" USING btree ("tenant_id","product_id");
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written: row-level security, one row per card, the keys to the product and the design, and grants (not
-- expressible in Drizzle).
-- ---------------------------------------------------------------------------------------------

-- DAT-03: tenant isolation, the same shape every other tenant-schema table uses.
ALTER TABLE tenant.storefront_card_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.storefront_card_positions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant.storefront_card_positions
  USING (tenant_id = tenant.current_tenant_id()) WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
ALTER TABLE tenant.storefront_product_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.storefront_product_cards FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant.storefront_product_cards
  USING (tenant_id = tenant.current_tenant_id()) WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
-- DC-8: one of the three ways; the default (a card per design) is kept as no row.
ALTER TABLE tenant.storefront_product_cards ADD CONSTRAINT storefront_product_cards_mode_check
  CHECK (mode IN ('designs', 'compact', 'both'));
--> statement-breakpoint
ALTER TABLE tenant.storefront_product_cards ADD CONSTRAINT storefront_product_cards_product_fk
  FOREIGN KEY (tenant_id, product_id) REFERENCES tenant.products (tenant_id, id) ON DELETE CASCADE;
--> statement-breakpoint
-- DC-6: one place per card -- a product's own card (no design) counts as one value.
CREATE UNIQUE INDEX storefront_card_positions_card_idx
  ON tenant.storefront_card_positions (tenant_id, product_id, design_option_id) NULLS NOT DISTINCT;
--> statement-breakpoint
-- DAT-02: a card is a product of the shop's own and, for a design's card, one of that shop's designs; a product or
-- design erased takes its place with it.
ALTER TABLE tenant.storefront_card_positions ADD CONSTRAINT storefront_card_positions_product_fk
  FOREIGN KEY (tenant_id, product_id) REFERENCES tenant.products (tenant_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE tenant.storefront_card_positions ADD CONSTRAINT storefront_card_positions_design_fk
  FOREIGN KEY (tenant_id, design_option_id) REFERENCES tenant.attribute_options (tenant_id, id) ON DELETE CASCADE;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.storefront_card_positions TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.storefront_product_cards TO lytronix_app;
  END IF;
END $$;
