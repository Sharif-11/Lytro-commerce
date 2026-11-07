-- Phase 7 Slice 7.3 (read agreed 2026-11-07): email, the bell and push. The addresses Lytro stops emailing after a
-- bounce or a spam complaint (NTF-06), the ID Resend gives each email it accepts, the language each person chose
-- (I18N-01), each person's notifications and the kinds they switched off (NTF-01, NTF-04), their browsers' push
-- subscriptions (NTF-02), and how long a notification is kept (D7-39).
CREATE TABLE IF NOT EXISTS "control"."mail_suppressions" (
	"email" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_suppressions_reason_check" CHECK ("control"."mail_suppressions"."reason" in ('bounced','complained'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."notification_preferences" (
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_tenant_id_user_id_kind_pk" PRIMARY KEY("tenant_id","user_id","kind")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"words" jsonb NOT NULL,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant"."push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"failures" integer DEFAULT 0 NOT NULL,
	"last_pushed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_user_endpoint_key" UNIQUE("tenant_id","user_id","endpoint")
);
--> statement-breakpoint
ALTER TABLE "control"."mail_outbox" DROP CONSTRAINT "mail_outbox_status_check";--> statement-breakpoint
ALTER TABLE "tenant"."users" ADD COLUMN "language" varchar(2);--> statement-breakpoint
ALTER TABLE "control"."mail_outbox" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."notification_preferences" ADD CONSTRAINT "notification_preferences_user_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "tenant"."users"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."notifications" ADD CONSTRAINT "notifications_user_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "tenant"."users"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "tenant"."users"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_idx" ON "tenant"."notifications" USING btree ("tenant_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_unread_idx" ON "tenant"."notifications" USING btree ("tenant_id","user_id") WHERE "tenant"."notifications"."read_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_created_idx" ON "tenant"."notifications" USING btree ("tenant_id","created_at");--> statement-breakpoint
ALTER TABLE "tenant"."users" ADD CONSTRAINT "users_language_check" CHECK ("tenant"."users"."language" IS NULL OR "tenant"."users"."language" IN ('bn', 'en'));--> statement-breakpoint
ALTER TABLE "control"."mail_outbox" ADD CONSTRAINT "mail_outbox_status_check" CHECK ("control"."mail_outbox"."status" in ('pending','sending','sent','failed','suppressed'));--> statement-breakpoint
ALTER TABLE tenant.notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.notifications FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.notifications USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
ALTER TABLE tenant.notification_preferences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.notification_preferences FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.notification_preferences USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
ALTER TABLE tenant.push_subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant.push_subscriptions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tenant.push_subscriptions USING (tenant_id = tenant.current_tenant_id())
  WITH CHECK (tenant_id = tenant.current_tenant_id());
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.mail_suppressions TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.notifications TO lytronix_app;
    GRANT SELECT, INSERT, DELETE ON tenant.notification_preferences TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.push_subscriptions TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- D7-39 (the owner's pick, 2026-11-07): a notification is kept 30 days; changed in operator settings without a release.
INSERT INTO control.platform_settings (key, value, description) VALUES
  ('notification_retention_days', '30', 'How many days a notification is kept in the bell before it is deleted (NTF-01, D7-39).')
ON CONFLICT (key) DO NOTHING;
