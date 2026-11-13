ALTER TABLE "control"."invoice_lines" DROP CONSTRAINT "invoice_lines_kind_check";--> statement-breakpoint
ALTER TABLE "control"."invoices" DROP CONSTRAINT "invoices_kind_check";--> statement-breakpoint
ALTER TABLE "control"."invoices" ADD COLUMN "seller_name" text;--> statement-breakpoint
ALTER TABLE "control"."invoices" ADD COLUMN "seller_address" text;--> statement-breakpoint
ALTER TABLE "control"."invoices" ADD COLUMN "seller_bin" text;--> statement-breakpoint
ALTER TABLE "control"."invoices" ADD COLUMN "vat_rate" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "control"."invoices" ADD COLUMN "vat_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "control"."invoice_lines" ADD CONSTRAINT "invoice_lines_kind_check" CHECK ("control"."invoice_lines"."kind" in ('plan','addon','credit','top_up'));--> statement-breakpoint
ALTER TABLE "control"."invoices" ADD CONSTRAINT "invoices_vat_check" CHECK (num_nulls("control"."invoices"."seller_name", "control"."invoices"."seller_address", "control"."invoices"."seller_bin", "control"."invoices"."vat_rate", "control"."invoices"."vat_amount") in (0, 5));--> statement-breakpoint
ALTER TABLE "control"."invoices" ADD CONSTRAINT "invoices_kind_check" CHECK ("control"."invoices"."kind" in ('purchase','renewal','upgrade','addon','credit_note','top_up'));--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------------------------
-- Hand-written below.
-- D9-7, LEG-03 (Phase 9 Slice 9.8): Lytro's VAT registration, empty until the operator sets it. Lytro's invoices carry
-- VAT only once all four are set, so registering later needs no code.
-- ---------------------------------------------------------------------------------------------------------------
INSERT INTO control.platform_settings (key, value, description) VALUES
  ('vat_bin', '""', 'Lytro''s VAT registration number (BIN), 9 or 13 digits; invoices carry VAT once all four VAT settings are set (D9-7, LEG-03).'),
  ('vat_rate', '""', 'The VAT rate in per cent, such as 15; prices include it, and an invoice shows the part that is VAT (D9-7).'),
  ('vat_seller_name', '""', 'The name Lytro is registered for VAT under, as its invoices print it (D9-7).'),
  ('vat_seller_address', '""', 'The address Lytro is registered for VAT at, as its invoices print it (D9-7).')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
-- LEG-01, LEG-02 (Slice 9.8): the first published terms of service and privacy policy, each named by the day it takes
-- effect. Every account created from now on records these; one created before keeps the placeholder it recorded.
UPDATE control.platform_settings SET value = '"2026-11-20"', updated_by = NULL, updated_at = now(),
  description = 'The terms of service in force, which a new account accepts: a published version, named by the day it takes effect (LEG-01).'
WHERE key = 'terms_version';
--> statement-breakpoint
UPDATE control.platform_settings SET value = '"2026-11-20"', updated_by = NULL, updated_at = now(),
  description = 'The privacy policy in force, which a new account accepts: a published version, named by the day it takes effect (LEG-01).'
WHERE key = 'privacy_version';
