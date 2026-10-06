ALTER TABLE "tenant"."users" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant"."users" ADD COLUMN "email" varchar(254);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_tenant_email_idx" ON "tenant"."users" USING btree ("tenant_id","email");