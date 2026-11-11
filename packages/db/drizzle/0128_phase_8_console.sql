ALTER TABLE "control"."manual_payment_entries" DROP CONSTRAINT "manual_payment_entries_evidence_check";--> statement-breakpoint
ALTER TABLE "control"."manual_payment_entries" ADD COLUMN "bank_account_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."manual_payment_entries" ADD CONSTRAINT "manual_payment_entries_bank_account_id_platform_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "control"."platform_bank_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "control"."manual_payment_entries" ADD CONSTRAINT "manual_payment_entries_evidence_check" CHECK ("control"."manual_payment_entries"."reverses_entry_id" IS NOT NULL OR (
        "control"."manual_payment_entries"."transaction_id" IS NOT NULL AND "control"."manual_payment_entries"."paid_at" IS NOT NULL
        AND ("control"."manual_payment_entries"."evidence_id" IS NOT NULL OR "control"."manual_payment_entries"."evidence_line" IS NOT NULL)
        AND (
          ("control"."manual_payment_entries"."wallet_id" IS NOT NULL AND "control"."manual_payment_entries"."bank_account_id" IS NULL AND "control"."manual_payment_entries"."sender_number" IS NOT NULL)
          OR ("control"."manual_payment_entries"."bank_account_id" IS NOT NULL AND "control"."manual_payment_entries"."wallet_id" IS NULL AND "control"."manual_payment_entries"."sender_number" IS NULL)
        )
      ));
--> statement-breakpoint
-- Slice 8.8 (OPERATOR-CONSOLE-DESIGN §15, KNOWN-GAPS §140): rows for the nine settings Slices 8.6 and 8.7 added, so the
-- console's settings list shows them and they can be changed. A number or address not set yet is stored empty, as the
-- media alert's address and the help line read it (D8-76); the rest start at their defaults.
INSERT INTO control.platform_settings (key, value, description) VALUES
  ('media_budget_usd', '10', 'The month''s budget for Lytro''s Cloudflare costs, in whole US dollars (MED-12, D8-58).'),
  ('media_budget_alert_percent', '80', 'The percent of the media budget that emails the alert address, once a billing period (MED-12).'),
  ('media_cost_alert_email', '""', 'The one address the media budget alert goes to (MED-12, D8-61).'),
  ('cloudflare_billing_day', '1', 'The day of the month Cloudflare''s invoice period starts on, 1 to 28 (MED-12, D8-61).'),
  ('cloudflare_prices', '{"r2ClassAPerMillion":4.5,"r2ClassBPerMillion":0.36,"r2StoragePerGbMonth":0.015,"r2FreeClassAMillions":1,"r2FreeClassBMillions":10,"r2FreeStorageGbMonths":10,"workersMonthly":5,"workersIncludedMillions":10,"workersPerMillion":0.3}', 'Cloudflare''s R2 and Workers prices and monthly allowances, in US dollars, that the media costs estimate uses (D8-60).'),
  ('help_whatsapp', '""', 'Lytro''s WhatsApp number, 01XXXXXXXXX, that the dashboard, Lytro''s payment page and the website show (D8-4, D8-68).'),
  ('help_phone', '""', 'Lytro''s phone number for calls, 01XXXXXXXXX, that the dashboard, Lytro''s payment page and the website show (D8-4, D8-68).'),
  ('help_opens_hour', '9', 'The hour Lytro starts answering the help line, every day, 0 to 23 in Dhaka (D8-68).'),
  ('help_closes_hour', '22', 'The hour Lytro stops answering the help line, every day, 0 to 23 in Dhaka (D8-68).')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
-- TEN-26 (the owner, 2026-11-10, via session 87): download.lytro.app is the listener downloads bucket's address
-- (DEPLOYMENT §4) and staging.lytro.app the staging platform's, so neither can be a shop's address.
INSERT INTO control.reserved_slugs (slug, reason) VALUES ('download', 'platform'), ('staging', 'platform')
ON CONFLICT (slug) DO NOTHING;
