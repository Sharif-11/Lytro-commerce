-- The seeder's second step (deploy/load/run/seed.sh), Phase 9 Slice 9.10: the load test's shops, signed up as trials by
-- seed-shops.js, made paying shops that can hold the capacity model's year: open, with no limit on products, orders or
-- requests, five paired phones and ten staff, and a balance for the order SMS the stand-in receives.
-- Run as the database's owner: psql -v prefix=lt -f seed-limits.sql
\set ON_ERROR_STOP on

BEGIN;

UPDATE control.tenants
SET state = 'active',
    plan_snapshot = coalesce(plan_snapshot, '{}'::jsonb) || jsonb_build_object(
      'products', null, 'orders_total', null, 'orders_handled_daily', null, 'orders_handled_monthly', null,
      'requests_monthly', null, 'storage_mb', null, 'bandwidth_gb', null, 'paired_devices', 5, 'staff', 10)
WHERE slug LIKE :'prefix' || '-s%';

INSERT INTO tenant.balance_ledger (tenant_id, type, amount, reference)
SELECT id, 'adjustment', 50000, '{"seeded": "load test"}'::jsonb
FROM control.tenants
WHERE slug LIKE :'prefix' || '-s%';

COMMIT;

SELECT count(*) AS shops_made_ready FROM control.tenants WHERE slug LIKE :'prefix' || '-s%' AND state = 'active';
