ALTER TABLE "control"."sms_outbox" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."sms_outbox" ADD CONSTRAINT "sms_outbox_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_outbox_tenant_idx" ON "control"."sms_outbox" USING btree ("tenant_id","created_at");