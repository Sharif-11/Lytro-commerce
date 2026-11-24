-- outside-transaction
-- PF-25, PF-38: a shop's orders still locked or at step 1, for the order list's chip and the operator's report. Kind:
-- add; the previous release never reads it.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "orders_tenant_access_idx" ON "tenant"."orders" USING btree ("tenant_id","access") WHERE "tenant"."orders"."access" IN ('locked', 'phone');
