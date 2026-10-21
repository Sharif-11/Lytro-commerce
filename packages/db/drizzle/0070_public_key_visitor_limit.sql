ALTER TABLE "control"."api_usage" ADD COLUMN "refused_requests" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."api_usage" ADD COLUMN "refused_visitors" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written: KNOWN-GAPS §82. A public key has no per-minute limit of its own any more: every shopper's request
-- carries the shop's one key, so it held back the whole shop. One visitor is held by RTE-06, whose figure becomes a
-- platform setting.
-- ---------------------------------------------------------------------------------------------

-- PLN-02, PLN-11: the limit leaves every plan, every shop's snapshot and every override. A plan's earlier versions and
-- past invoices keep it, as the record of what was sold then.
UPDATE control.plans SET limits = limits - 'requests_per_minute_public'
WHERE limits ? 'requests_per_minute_public';
--> statement-breakpoint
UPDATE control.tenants SET plan_snapshot = plan_snapshot - 'requests_per_minute_public'
WHERE plan_snapshot ? 'requests_per_minute_public';
--> statement-breakpoint
DELETE FROM control.plan_limit_overrides WHERE limit_key = 'requests_per_minute_public';
--> statement-breakpoint
-- RTE-06 (editable): one visitor's requests a minute to one shop.
INSERT INTO control.platform_settings (key, value, description) VALUES
  ('public_requests_per_visitor_per_minute', '120', 'How many requests one visitor may make to one shop in a minute, through its public keys (RTE-06).')
ON CONFLICT (key) DO NOTHING;
