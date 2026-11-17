-- D9-32 (2026-11-17, the owner): shop pages are kept at Cloudflare's edge, so a viral product's shoppers reach the
-- server far less often than they reach the order form; one shop's shoppers may now place 180 orders a minute.
-- reference-data: the platform setting's default rises from 60 to 180; an operator's own figure stays as set.
-- The previous release reads the setting as it reads any figure the operator saved.
UPDATE control.platform_settings
SET value = '180'::jsonb
WHERE key = 'public_orders_per_shop_per_minute' AND value = '60'::jsonb;
