-- outside-transaction
-- SB-10 (the owner, 2026-11-20): the card facts tick asks each minute, for every shop, whether an order of its changed
-- since the shop's last run (0148). Kind: add; the previous release never reads it.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "orders_tenant_updated_idx" ON "tenant"."orders" USING btree ("tenant_id","updated_at");
