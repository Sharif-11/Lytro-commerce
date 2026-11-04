-- ADM-01 (amended 2026-11-04): an operator account's failed sign-ins, on AUTH-14's rule: control.sign_in_failures
-- already carries the app role's SELECT and INSERT, so a new column needs no new grant.
ALTER TABLE "control"."sign_in_failures" ADD COLUMN "operator_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."sign_in_failures" ADD CONSTRAINT "sign_in_failures_operator_id_operator_accounts_id_fk" FOREIGN KEY ("operator_id") REFERENCES "control"."operator_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sign_in_failures_operator_idx" ON "control"."sign_in_failures" USING btree ("operator_id","created_at");