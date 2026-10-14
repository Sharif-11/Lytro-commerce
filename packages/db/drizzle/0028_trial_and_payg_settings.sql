ALTER TABLE "control"."platform_settings" ALTER COLUMN "updated_by" DROP NOT NULL;
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written seed data (not expressible in Drizzle). Reviewed with the schema change above.
-- ---------------------------------------------------------------------------------------------

-- LIF-26: the trial length as a platform setting, so an operator can change it without a deploy
-- (PlatformSettingsService). updated_by is null -- a system-seeded default, not an operator's own change.
INSERT INTO control.platform_settings (key, value, description) VALUES
  ('trial_days', '30', 'How many days a new shop stays on the Trial plan (TRL-01).')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
-- TRL-07/PYG-01/PYG-20: the plan a trial converts to at day 30 with no purchase. Not for sale, so its rank
-- (0) does not compete with Starter/Growth/Pro for PLN-16's uniqueness, the same reason Trial's rank is 0.
-- Limits are SRS-detailed.md §2.1's Pay-as-you-go column, each strictly below Starter's own (PYG-20):
-- no orders_total/orders_handled_monthly at all (PYG-05: order creation is never capped, fees are per
-- fulfillment/creation instead, not a count).
INSERT INTO control.plans (name, rank, for_sale, version, limits, features) VALUES
  ('Pay-as-you-go', 0, false, 1,
   '{"products": 25, "staff": 1, "paired_devices": 1, "storage_mb": 250, "bandwidth_gb": 10, "essential_sms_monthly": 5, "activity_retention_days": 30}',
   '{}');
