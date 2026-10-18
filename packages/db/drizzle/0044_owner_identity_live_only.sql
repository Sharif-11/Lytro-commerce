-- TEN-15, LIF-21: an identity may hold one tenant that is not deleted. An owner whose shop was deleted
-- opens a new one on the same identity, so the uniqueness covers live tenants only.
ALTER TABLE "control"."tenants" DROP CONSTRAINT "tenants_owner_identity_id_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_owner_identity_live_idx" ON "control"."tenants" USING btree ("owner_identity_id") WHERE "control"."tenants"."deleted_at" IS NULL;