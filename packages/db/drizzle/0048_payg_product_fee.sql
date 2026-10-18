-- 2.1, OD-48, PYG-16: the pay-as-you-go product-creation fee is 10 TK. Migration 0026 seeded it at 0 as a
-- placeholder. This sets it only while it is still that untouched placeholder -- never over a value an operator
-- already set (any rate_history row for the key) -- and records the change in rate_history like any edit.
WITH changed AS (
  UPDATE control.rates
  SET value = 10, effective_from = now()
  WHERE key = 'payg_product_fee'
    AND value = 0
    AND NOT EXISTS (SELECT 1 FROM control.rate_history WHERE key = 'payg_product_fee')
  RETURNING key
)
INSERT INTO control.rate_history (key, old_value, new_value, changed_by)
SELECT key, 0, 10, NULL FROM changed;
