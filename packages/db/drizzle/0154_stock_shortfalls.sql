-- ORDERS-BEYOND-STOCK-PLAN OB-6, INV-25 (approved by the owner 2026-11-25): what an order line still waits for when the
-- order asked for more of a tracked product than was free. Kind: add -- a new table, empty, with its own indexes and keys.
-- Single-step add: nothing is moved or dropped. The previous release never reads it; a rollback leaves rows nobody
-- reads, and an order that waited could then ship holding only what it held (stated in the PR).
CREATE TABLE "tenant"."stock_shortfalls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_line_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"sold_variant_id" uuid NOT NULL,
	"pack_amount" numeric(14, 3),
	"quantity" numeric(14, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_shortfalls_tenant_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "stock_shortfalls_quantity_check" CHECK ("tenant"."stock_shortfalls"."quantity" > 0),
	CONSTRAINT "stock_shortfalls_pack_check" CHECK ("tenant"."stock_shortfalls"."pack_amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "tenant"."stock_shortfalls" ADD CONSTRAINT "stock_shortfalls_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "tenant"."orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant"."stock_shortfalls" ADD CONSTRAINT "stock_shortfalls_line_fk" FOREIGN KEY ("tenant_id","order_line_id") REFERENCES "tenant"."order_lines"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_shortfalls_line_idx" ON "tenant"."stock_shortfalls" USING btree ("tenant_id","order_line_id","sold_variant_id");--> statement-breakpoint
CREATE INDEX "stock_shortfalls_fill_idx" ON "tenant"."stock_shortfalls" USING btree ("tenant_id","variant_id","created_at","id");--> statement-breakpoint
CREATE INDEX "stock_shortfalls_order_idx" ON "tenant"."stock_shortfalls" USING btree ("tenant_id","order_id");
--> statement-breakpoint
-- Row-level security like every tenant table.
ALTER TABLE tenant.stock_shortfalls ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.stock_shortfalls FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.stock_shortfalls USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    -- Written when an order waits, changed as stock fills it, and gone once filled or with its order.
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.stock_shortfalls TO lytronix_app;
  END IF;
END $$;
