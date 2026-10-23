ALTER TABLE "control"."invoices" ADD COLUMN "plan_payment_id" uuid;--> statement-breakpoint
ALTER TABLE "control"."plan_payments" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "control"."plan_payments" ADD COLUMN "note" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."invoices" ADD CONSTRAINT "invoices_plan_payment_id_plan_payments_id_fk" FOREIGN KEY ("plan_payment_id") REFERENCES "control"."plan_payments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_payments_tenant_quoted_idx" ON "control"."plan_payments" USING btree ("tenant_id","quoted_at");