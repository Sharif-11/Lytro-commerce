CREATE TABLE IF NOT EXISTS "control"."operator_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"two_factor_secret" text,
	"two_factor_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operator_accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."operator_backup_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "control"."operator_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"csrf_hash" text NOT NULL,
	"operator_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent" text,
	"ip" "inet",
	CONSTRAINT "operator_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."operator_backup_codes" ADD CONSTRAINT "operator_backup_codes_operator_id_operator_accounts_id_fk" FOREIGN KEY ("operator_id") REFERENCES "control"."operator_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."operator_sessions" ADD CONSTRAINT "operator_sessions_operator_id_operator_accounts_id_fk" FOREIGN KEY ("operator_id") REFERENCES "control"."operator_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "operator_backup_codes_operator_idx" ON "control"."operator_backup_codes" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "operator_sessions_operator_idx" ON "control"."operator_sessions" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "operator_sessions_expires_idx" ON "control"."operator_sessions" USING btree ("expires_at");
--> statement-breakpoint
-- Application role grants (see the note in 0001). Each new table needs its grants here. No INSERT on
-- operator_accounts: accounts are created only by the privileged create-operator script (D8), never the live
-- app. No DELETE anywhere here: break-glass recovery (ADM-18) runs as its own privileged script too, the same
-- category as that account-creation script and as the activity-log purge (D24) — never from the app role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT SELECT, UPDATE ON control.operator_accounts TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE ON control.operator_backup_codes TO lytronix_app;
    GRANT SELECT, INSERT, UPDATE ON control.operator_sessions TO lytronix_app;
  END IF;
END $$;