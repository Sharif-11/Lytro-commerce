ALTER TABLE "tenant"."orders" ADD COLUMN "shopper_note" varchar(500);--> statement-breakpoint
ALTER TABLE "control"."api_usage" ADD COLUMN "refused_orders" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written: RTE-08, amended 2026-10-30. Shoppers' orders into one shop are held by one figure for every plan,
-- a flood guard the operator can raise, never a cap on demand (QTA-07). One visitor is held apart by RTE-06.
-- ---------------------------------------------------------------------------------------------
INSERT INTO control.platform_settings (key, value, description) VALUES
  ('public_orders_per_shop_per_minute', '60', 'How many orders shoppers may place in one shop in a minute, every plan alike (RTE-08).')
ON CONFLICT (key) DO NOTHING;
