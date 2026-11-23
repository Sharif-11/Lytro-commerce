-- PAYG-FAIR-USE-PLAN (approved by the owner 2026-11-23): pay-as-you-go fair use, built behind the operator switch
-- payg_fair_use, off. Kind: add -- a new enum, new enum values, new columns with constant defaults (no rewrite), new
-- rates and settings. Single-step add: nothing is moved or dropped. The previous release never reads the new columns,
-- and nothing writes a new value (a locked order, an order_unlock or api_requests entry) until the operator turns the
-- switch on, so a rollback with the switch off reads only what it always did.
CREATE TYPE "tenant"."order_access" AS ENUM('open', 'locked', 'phone', 'confirmed');--> statement-breakpoint
ALTER TYPE "tenant"."ledger_entry_type" ADD VALUE IF NOT EXISTS 'order_unlock';--> statement-breakpoint
ALTER TYPE "tenant"."ledger_entry_type" ADD VALUE IF NOT EXISTS 'api_requests';--> statement-breakpoint
ALTER TABLE "control"."tenants" ADD COLUMN "storefront_activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "control"."tenants" ADD COLUMN "api_monthly_cap" numeric(12, 2) DEFAULT '200.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant"."orders" ADD COLUMN "access" "tenant"."order_access" DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant"."orders" ADD COLUMN "phone_shown_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant"."orders" ADD COLUMN "phone_shown_by" uuid;--> statement-breakpoint
ALTER TABLE "control"."api_usage" ADD COLUMN "billable" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."api_usage" ADD COLUMN "billed_blocks" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."api_usage" ADD COLUMN "charged" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."api_usage" ADD COLUMN "charge_warned" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."api_usage_daily" ADD COLUMN "billable" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "control"."api_usage_daily" ADD COLUMN "charged" numeric(12, 2) DEFAULT '0' NOT NULL;
--> statement-breakpoint
-- RAT-17 to RAT-20 (PF-2 to PF-4, PF-11, PF-14): the phone shown 7 TK, the confirm 3 TK, a manual order's courier
-- booked through Lytro 10 TK, and 1 TK for every 1,000 successful API requests past the free allowance. Editable.
INSERT INTO control.rates (key, value) VALUES
  ('payg_unlock_phone', 7.00),
  ('payg_unlock_confirm', 3.00),
  ('payg_booking_fee', 10.00),
  ('payg_api_per_thousand', 1.00)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
-- PYG-30, PF-13, PF-14: the switch (off), the activation top-up (10 TK) and the free requests a cycle (10,000).
INSERT INTO control.platform_settings (key, value, description) VALUES
  ('payg_fair_use', '"off"', 'Pay-as-you-go fair use: orders from Lytro opened for 7 + 3 TK, the 10 TK activation top-up, and the API charge past the free requests. Off until its screens are live (PYG-30).'),
  ('payg_activation_topup', '10', 'The one top-up, in TK, that opens a pay-as-you-go shop''s storefront, landing pages and public key once fair use is on (PF-13).'),
  ('payg_api_free_requests', '10000', 'The successful requests a pay-as-you-go shop''s own website makes free each cycle, before 1 TK per 1,000 (PF-14).')
ON CONFLICT (key) DO NOTHING;
