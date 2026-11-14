-- The seeder's last step (deploy/load/run/seed.sh), Phase 9 Slice 9.10: seed-orders.js placed a year of orders within
-- an hour; this spreads them over the past year, as the load test's data needs (DAT-32: 50 shops' volume). Each order
-- gets one shift, applied to every time it and its rows carry: a finished order (delivered or cancelled) lands anywhere
-- in the year, an open one in the last three days, as a real shop's open orders are recent. Customers then take their
-- first and newest order's times. Order numbers keep the day they were placed on: nothing reads a date from them.
--
-- The history tables refuse edits by trigger (they are kept as written), so triggers are off for this one transaction:
-- run as the database's owner, which is a superuser. psql -v prefix=lt -f spread-year.sql
\set ON_ERROR_STOP on

BEGIN;
SET LOCAL session_replication_role = 'replica';

CREATE TEMP TABLE shifted ON COMMIT DROP AS
SELECT o.id,
       (CASE
          WHEN o.delivered_at IS NOT NULL OR o.cancelled_at IS NOT NULL
            THEN now() - interval '3 days' - random() * interval '362 days'
          ELSE now() - random() * interval '3 days'
        END) - o.created_at AS shift
FROM tenant.orders o
JOIN control.tenants t ON t.id = o.tenant_id
WHERE t.slug LIKE :'prefix' || '-s%';
CREATE INDEX ON shifted (id);
ANALYZE shifted;

UPDATE tenant.orders o
SET created_at = o.created_at + s.shift,
    updated_at = o.updated_at + s.shift,
    confirmed_at = o.confirmed_at + s.shift,
    cancelled_at = o.cancelled_at + s.shift,
    shipped_at = o.shipped_at + s.shift,
    delivered_at = o.delivered_at + s.shift,
    handled_at = o.handled_at + s.shift,
    hold_until = o.hold_until + s.shift
FROM shifted s WHERE o.id = s.id;

UPDATE tenant.order_status_history h SET changed_at = h.changed_at + s.shift FROM shifted s WHERE h.order_id = s.id;
UPDATE tenant.order_calls c
SET called_at = c.called_at + s.shift, call_back_at = c.call_back_at + s.shift
FROM shifted s WHERE c.order_id = s.id;
UPDATE tenant.payments p
SET verified_at = p.verified_at + s.shift, voided_at = p.voided_at + s.shift, refunded_at = p.refunded_at + s.shift
FROM shifted s WHERE p.order_id = s.id;
UPDATE tenant.payment_sessions p
SET created_at = p.created_at + s.shift, updated_at = p.updated_at + s.shift, expires_at = p.expires_at + s.shift,
    submitted_at = p.submitted_at + s.shift, decided_at = p.decided_at + s.shift, staff_told_at = p.staff_told_at + s.shift
FROM shifted s WHERE p.order_id = s.id;
UPDATE tenant.stock_reservations r
SET created_at = r.created_at + s.shift, resolved_at = r.resolved_at + s.shift, expires_at = r.expires_at + s.shift
FROM shifted s WHERE r.order_id = s.id;
UPDATE tenant.sms_log l SET created_at = l.created_at + s.shift FROM shifted s WHERE l.order_id = s.id;
UPDATE tenant.fraud_checks f SET created_at = f.created_at + s.shift FROM shifted s WHERE f.order_id = s.id;
UPDATE tenant.fraud_check_skips f SET created_at = f.created_at + s.shift FROM shifted s WHERE f.order_id = s.id;

UPDATE tenant.customers c
SET created_at = least(c.created_at, span.first_at), last_order_at = span.last_at
FROM (
  SELECT o.customer_id, min(o.created_at) AS first_at, max(o.created_at) AS last_at
  FROM tenant.orders o JOIN shifted s ON s.id = o.id
  WHERE o.customer_id IS NOT NULL
  GROUP BY o.customer_id
) span
WHERE c.id = span.customer_id;

SELECT count(*) AS orders_spread, min(o.created_at)::date AS oldest, max(o.created_at)::date AS newest
FROM tenant.orders o JOIN shifted s ON s.id = o.id;

COMMIT;

-- The planner's figures, after a year moved at once.
ANALYZE;
