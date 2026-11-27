-- LIVE-CHAT-PLAN LC-1 to LC-13, LC-24, LC-25 (approved by the owner 2026-11-27), PR 1: live chat between a shop and
-- Lytro. Kind: add -- seven new tables, empty, with their own indexes and keys, and four new platform settings. Single-step
-- add: nothing is moved or dropped. The previous release never reads these tables; its settings list reads the four new
-- rows as it reads any other (text keys), and a rollback leaves rows nobody reads.
CREATE TABLE "control"."chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sender_kind" text NOT NULL,
	"user_id" uuid,
	"operator_id" uuid,
	"sender_name" varchar(120),
	"system_kind" text,
	"body" varchar(2000) DEFAULT '' NOT NULL,
	"page" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_sender_kind_check" CHECK ("control"."chat_messages"."sender_kind" IN ('owner','staff','lytro','system')),
	CONSTRAINT "chat_messages_system_kind_check" CHECK ("control"."chat_messages"."system_kind" IS NULL OR "control"."chat_messages"."system_kind" IN ('busy','off_hours'))
);
--> statement-breakpoint
CREATE TABLE "control"."chat_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "control"."chat_quick_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(60) NOT NULL,
	"body" varchar(1000) NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "control"."chat_reads" (
	"tenant_id" uuid NOT NULL,
	"reader_kind" text NOT NULL,
	"reader_id" uuid NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "chat_reads_tenant_id_reader_kind_reader_id_pk" PRIMARY KEY("tenant_id","reader_kind","reader_id"),
	CONSTRAINT "chat_reads_reader_kind_check" CHECK ("control"."chat_reads"."reader_kind" IN ('shop','lytro'))
);
--> statement-breakpoint
CREATE TABLE "control"."chat_threads" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"last_message_at" timestamp with time zone NOT NULL,
	"last_sender_kind" text NOT NULL,
	"last_preview" varchar(120) DEFAULT '' NOT NULL,
	"waiting_since" timestamp with time zone,
	"busy_sent_at" timestamp with time zone,
	"off_hours_sent_at" timestamp with time zone,
	"last_page" varchar(200)
);
--> statement-breakpoint
CREATE TABLE "control"."operator_push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"last_pushed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operator_push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "control"."shop_feature_overrides" (
	"tenant_id" uuid NOT NULL,
	"feature_key" varchar(64) NOT NULL,
	"enabled" boolean NOT NULL,
	"set_by" uuid,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_feature_overrides_tenant_id_feature_key_pk" PRIMARY KEY("tenant_id","feature_key")
);
--> statement-breakpoint
ALTER TABLE "control"."chat_messages" ADD CONSTRAINT "chat_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control"."chat_messages" ADD CONSTRAINT "chat_messages_operator_id_operator_accounts_id_fk" FOREIGN KEY ("operator_id") REFERENCES "control"."operator_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control"."chat_photos" ADD CONSTRAINT "chat_photos_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "control"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control"."chat_reads" ADD CONSTRAINT "chat_reads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control"."chat_threads" ADD CONSTRAINT "chat_threads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control"."operator_push_subscriptions" ADD CONSTRAINT "operator_push_subscriptions_operator_id_operator_accounts_id_fk" FOREIGN KEY ("operator_id") REFERENCES "control"."operator_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control"."shop_feature_overrides" ADD CONSTRAINT "shop_feature_overrides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "control"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control"."shop_feature_overrides" ADD CONSTRAINT "shop_feature_overrides_set_by_operator_accounts_id_fk" FOREIGN KEY ("set_by") REFERENCES "control"."operator_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_tenant_idx" ON "control"."chat_messages" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_created_idx" ON "control"."chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chat_photos_message_idx" ON "control"."chat_photos" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "chat_photos_kept_idx" ON "control"."chat_photos" USING btree ("created_at") WHERE "control"."chat_photos"."removed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "chat_threads_waiting_idx" ON "control"."chat_threads" USING btree ("waiting_since");--> statement-breakpoint
CREATE INDEX "chat_threads_last_idx" ON "control"."chat_threads" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "operator_push_subscriptions_operator_idx" ON "control"."operator_push_subscriptions" USING btree ("operator_id");

--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON control.chat_threads, control.chat_messages, control.chat_photos,
      control.chat_reads, control.chat_quick_replies, control.shop_feature_overrides,
      control.operator_push_subscriptions TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- reference-data: the live chat's four settings at the owner's numbers (LC-5 busy line after 10 minutes, LC-11 messages
-- kept 7 days, LC-8 photos kept 3, LC-25 20 messages a person a minute); new rows only, never a change to one.
INSERT INTO control.platform_settings (key, value, description) VALUES
  ('chat_busy_minutes', '10', 'Minutes a shop''s chat message waits unanswered within hours before Lytro''s busy line goes (LC-5).'),
  ('chat_history_days', '7', 'Days a live chat message is kept before the nightly clean-up deletes it (LC-11).'),
  ('chat_photo_days', '3', 'Days a live chat photo is kept, never longer than the messages (LC-8).'),
  ('chat_messages_per_minute', '20', 'Live chat messages one person may send in a minute (LC-25).')
ON CONFLICT (key) DO NOTHING;
