-- CCH-12 (Phase 3 Slice 9a): trigram matching for the catalogue search's partial words and typos. A trusted
-- extension, so the database's owner may create it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."platform_catalogue_state" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "platform_catalogue_state_one_row" CHECK ("control"."platform_catalogue_state"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "tenant"."product_variants" ADD COLUMN "stock_state" "tenant"."stock_state" DEFAULT 'out' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant"."products" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce("name", '')), 'A') || setweight(to_tsvector('simple', coalesce("description", '')), 'B')) STORED;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_public_featured_idx" ON "tenant"."products" USING btree ("tenant_id",(-"sort_order"),"created_at","id") WHERE "tenant"."products"."active" AND "tenant"."products"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_public_newest_idx" ON "tenant"."products" USING btree ("tenant_id","created_at","id") WHERE "tenant"."products"."active" AND "tenant"."products"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_public_price_idx" ON "tenant"."products" USING btree ("tenant_id","min_price","id") WHERE "tenant"."products"."active" AND "tenant"."products"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_search_idx" ON "tenant"."products" USING gin ("search_vector") WHERE "tenant"."products"."active" AND "tenant"."products"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_name_trgm_idx" ON "tenant"."products" USING gin ("name" gin_trgm_ops) WHERE "tenant"."products"."active" AND "tenant"."products"."deleted_at" IS NULL;--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written: the platform version's row, grants, the stock states of the variants that already exist, and the
-- cache lifetimes (not expressible in Drizzle). DATABASE-SCHEMA §3.2, Phase 3 Slice 9a (CCH-02, CCH-03, CCH-08,
-- KNOWN-GAPS §66).
-- ---------------------------------------------------------------------------------------------

INSERT INTO control.platform_catalogue_state (id, version) VALUES (1, 1) ON CONFLICT (id) DO NOTHING;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, UPDATE ON control.platform_catalogue_state TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- CCH-08: each existing variant's public state, by the stock ledger's own rules (inventory/services/stock-state.ts):
-- a product whose stock is not counted is in; a variant drawing on a shared stock is out without one whole pack
-- left and low at or under the threshold; any other variant is out with nothing available and low at or under its
-- product's threshold. Then each product's state is its best active variant's. Shop by shop, since row-level security
-- is forced on these tables. A product's price range is filled in where it was never worked out.
DO $$
DECLARE
  shop uuid;
BEGIN
  FOR shop IN SELECT id FROM control.tenants LOOP
    PERFORM set_config('app.tenant_id', shop::text, true);
    UPDATE tenant.product_variants v SET stock_state = s.state
    FROM (
      SELECT v2.id,
        (CASE
          WHEN p.stock_tracking = 'not_tracked' THEN 'in'
          WHEN p.shared_stock THEN
            CASE
              WHEN v2.pack_amount IS NULL OR v2.pack_amount <= 0
                OR coalesce(h.available, 0) < v2.pack_amount THEN 'out'
              WHEN coalesce(h.available, 0) <= p.low_stock_threshold THEN 'low'
              ELSE 'in'
            END
          WHEN coalesce(l.available, 0) <= 0 THEN 'out'
          WHEN l.available <= p.low_stock_threshold THEN 'low'
          ELSE 'in'
        END)::tenant.stock_state AS state
      FROM tenant.product_variants v2
      JOIN tenant.products p ON p.tenant_id = v2.tenant_id AND p.id = v2.product_id
      LEFT JOIN tenant.stock_levels l ON l.tenant_id = v2.tenant_id AND l.variant_id = v2.id
      LEFT JOIN tenant.product_variants hv
        ON hv.tenant_id = v2.tenant_id AND hv.product_id = v2.product_id AND hv.is_stock_holder
          AND hv.deleted_at IS NULL
      LEFT JOIN tenant.stock_levels h ON h.tenant_id = hv.tenant_id AND h.variant_id = hv.id
      WHERE v2.tenant_id = shop AND NOT v2.is_stock_holder
    ) s
    WHERE v.tenant_id = shop AND v.id = s.id;
    UPDATE tenant.products p SET stock_state = (
      SELECT (CASE
        WHEN bool_or(v.stock_state = 'in') THEN 'in'
        WHEN bool_or(v.stock_state = 'low') THEN 'low'
        ELSE 'out'
      END)::tenant.stock_state
      FROM tenant.product_variants v
      WHERE v.tenant_id = p.tenant_id AND v.product_id = p.id AND v.active AND v.deleted_at IS NULL
        AND NOT v.is_stock_holder
    )
    WHERE p.tenant_id = shop;
    UPDATE tenant.products SET min_price = base_price, max_price = base_price
    WHERE tenant_id = shop AND min_price IS NULL;
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END $$;
--> statement-breakpoint
-- CCH-03 (editable): how long a shopper's browser may keep each kind of public catalogue answer, in seconds.
INSERT INTO control.platform_settings (key, value, description) VALUES
  ('catalogue_list_max_age_seconds', '30', 'How long a shopper''s browser keeps a product list, in seconds (CCH-03).'),
  ('catalogue_list_stale_seconds', '120', 'How long an older product list may still be shown while it is fetched again, in seconds (CCH-03).'),
  ('catalogue_detail_max_age_seconds', '60', 'How long a shopper''s browser keeps a product page, in seconds (CCH-03).'),
  ('catalogue_search_max_age_seconds', '30', 'How long a shopper''s browser keeps search results, in seconds (CCH-03).'),
  ('catalogue_categories_max_age_seconds', '300', 'How long a shopper''s browser keeps the category tree, in seconds (CCH-03).')
ON CONFLICT (key) DO NOTHING;
