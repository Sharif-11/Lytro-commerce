-- D9-31 (2026-11-17, the owner): public media is served straight from the media bucket behind Cloudflare's cache, with
-- no Worker counting it, so media bandwidth is no longer a plan limit or a pack. Shops' own rows are left alone: a
-- plan snapshot or override still naming bandwidth_gb is dropped as the limits are composed (RETIRED_LIMIT_KEYS), and
-- the old bandwidth tables and tenants.auto_buy_bandwidth stay until a later release drops them.
-- reference-data: Lytro's own plans, add-on catalogue and settings lose what described bandwidth and the Worker.
-- The previous release reads a plan without bandwidth_gb as unlimited bandwidth, a retired pack as one no longer for
-- sale, and prices without Workers' fields by falling back to its defaults.
UPDATE control.plans SET limits = limits - 'bandwidth_gb' WHERE limits ? 'bandwidth_gb';
--> statement-breakpoint
UPDATE control.addons SET retired_at = now() WHERE key = 'bandwidth_pack' AND retired_at IS NULL;
--> statement-breakpoint
UPDATE control.platform_settings
SET value = value - 'workersMonthly' - 'workersIncludedMillions' - 'workersPerMillion',
  description = 'Cloudflare''s R2 prices and monthly allowances, in US dollars, that the media costs estimate uses (D8-60).'
WHERE key = 'cloudflare_prices';
--> statement-breakpoint
UPDATE control.platform_settings
SET description = 'How far past its API request limit a shop is still served, as a percent of the limit (RTE-03).'
WHERE key = 'usage_grace_percent';
