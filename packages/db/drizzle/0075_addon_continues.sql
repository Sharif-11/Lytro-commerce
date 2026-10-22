ALTER TABLE "control"."addon_purchases" ADD COLUMN "continues_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "control"."addon_purchases" ADD CONSTRAINT "addon_purchases_continues_id_addon_purchases_id_fk" FOREIGN KEY ("continues_id") REFERENCES "control"."addon_purchases"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "addon_purchases_ending_idx" ON "control"."addon_purchases" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "addon_purchases_continues_idx" ON "control"."addon_purchases" USING btree ("continues_id");