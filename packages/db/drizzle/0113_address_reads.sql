CREATE TABLE IF NOT EXISTS "tenant"."order_extractions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"input_chars" integer NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"paid_from" text NOT NULL,
	"cost" numeric(10, 2) NOT NULL,
	"addon_purchase_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_extractions_chars_check" CHECK ("tenant"."order_extractions"."input_chars" BETWEEN 1 AND 4000),
	CONSTRAINT "order_extractions_cost_check" CHECK ("tenant"."order_extractions"."cost" >= 0),
	CONSTRAINT "order_extractions_paid_from_check" CHECK ("tenant"."order_extractions"."paid_from" in ('balance','allowance') AND ("tenant"."order_extractions"."paid_from" = 'allowance') = ("tenant"."order_extractions"."addon_purchase_id" IS NOT NULL))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."order_extractions" ADD CONSTRAINT "order_extractions_addon_purchase_id_addon_purchases_id_fk" FOREIGN KEY ("addon_purchase_id") REFERENCES "control"."addon_purchases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_extractions_tenant_idx" ON "tenant"."order_extractions" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_extractions_purchase_idx" ON "tenant"."order_extractions" USING btree ("addon_purchase_id");
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written security and settings (not expressible in Drizzle). Phase 7 Slice 7.6, read agreed 2026-11-06.
-- ---------------------------------------------------------------------------------------------

-- ORD-34, PLN-20: a shop's own charged reads, only ever its own. Written once and never changed.
ALTER TABLE tenant.order_extractions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.order_extractions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.order_extractions USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT ON tenant.order_extractions TO lytronix_app;
    GRANT USAGE, SELECT ON SEQUENCE tenant.order_extractions_id_seq TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- ORD-34, D7-16 (the owner's pick, 2026-11-06): 0.10 TK a read that finds something. A read costs Lytro about 0.04 TK on
-- Gemini 3.5 Flash-Lite. Editable in Rates like any other.
INSERT INTO control.rates (key, value) VALUES ('ai_extraction', 0.10) ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
-- PLN-13, PLN-20, D7-17 (the owner's words, 2026-11-06: "200 reads 20 tk per month"): the first allowance, editable data.
INSERT INTO control.addons (key, kind, limit_key, unit_size, price, label_en, label_bn) VALUES
  ('address_reads_200', 'allowance', 'address_reads', 200, 20, 'Address reads from messages', 'মেসেজ থেকে ঠিকানা পড়া')
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
-- AI-10, D7-4, ORD-33 (Slice 7.6's read, 2026-11-06): the AI and model that read messages, the owner's pick after the
-- tries, and one shop's reads a minute, a flood guard; changed in operator settings without a release.
INSERT INTO control.platform_settings (key, value, description) VALUES
  ('address_read_provider', '"gemini"', 'The AI that reads a customer''s delivery details from a pasted message: gemini (AI-10, D7-4).'),
  ('address_read_model', '"gemini-3.5-flash-lite"', 'The AI''s model for reading delivery details, as the AI names it, such as gemini-3.5-flash-lite (AI-10, D7-4).'),
  ('address_reads_per_shop_per_minute', '30', 'How many messages one shop may have read in a minute, a flood guard (ORD-33).')
ON CONFLICT (key) DO NOTHING;
