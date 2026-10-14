ALTER TABLE "control"."tenants" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "control"."tenants" ADD COLUMN "deleted_at" timestamp with time zone;
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written seed data (not expressible in Drizzle). Reviewed with the schema change above.
-- ---------------------------------------------------------------------------------------------

-- LIF-26, 2.3: the lifecycle stage lengths, each a day-count within that stage (not cumulative from period
-- end) -- grace 0-3, read_only 3-7, locked 7-15, archived 15-60 by default.
INSERT INTO control.platform_settings (key, value, description) VALUES
  ('grace_days', '3', 'How many days of grace a lapsed tenant gets (LIF-26, 2.3).'),
  ('read_only_days', '4', 'How many days after grace a lapsed tenant stays read-only (LIF-26, 2.3).'),
  ('locked_days', '8', 'How many days after read-only a lapsed tenant stays locked (LIF-26, 2.3).'),
  ('archived_days', '45', 'How many days after locked a lapsed tenant stays archived before deletion (LIF-26, 2.3).')
ON CONFLICT (key) DO NOTHING;