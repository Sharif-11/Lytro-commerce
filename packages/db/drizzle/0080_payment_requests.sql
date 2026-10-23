ALTER TABLE "control"."invoices" DROP CONSTRAINT "invoices_plan_payment_id_plan_payments_id_fk";
--> statement-breakpoint
-- The index lives in the control schema: drizzle-kit names it without one, which would drop nothing and leave the
-- old condition in place behind the CREATE ... IF NOT EXISTS below.
DROP INDEX IF EXISTS "control"."plan_payments_transaction_id_idx";--> statement-breakpoint
ALTER TABLE "control"."plan_payments" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
-- BIL-19 (decided 2026-10-23): an invoice issued before plan_payment_id was recorded gets it where its transaction ID
-- names the payment it was the receipt of, and only that one invoice carries the ID. A payment from the balance has no
-- transaction ID to match by, so those stay empty.
UPDATE "control"."invoices" AS i
SET "plan_payment_id" = p."id"
FROM "control"."plan_payments" AS p
WHERE i."plan_payment_id" IS NULL
  AND i."payment_reference" IS NOT NULL
  AND p."transaction_id" = i."payment_reference"
  AND p."tenant_id" = i."tenant_id"
  AND p."status" = 'verified'
  AND (
    SELECT count(*) FROM "control"."invoices" AS k
    WHERE k."tenant_id" = i."tenant_id" AND k."payment_reference" = i."payment_reference"
  ) = 1
  AND NOT EXISTS (SELECT 1 FROM "control"."invoices" AS j WHERE j."plan_payment_id" = p."id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_plan_payment_id_idx" ON "control"."invoices" USING btree ("plan_payment_id") WHERE "control"."invoices"."plan_payment_id" IS NOT NULL;--> statement-breakpoint
-- UPG-08: before the database holds one open upgrade per shop, an unsubmitted open upgrade is closed as replaced when
-- the shop has another open one that was submitted or quoted later -- the race the old check-then-insert allowed.
UPDATE "control"."plan_payments" AS p
SET "status" = 'cancelled', "cancel_reason" = 'replaced', "verified_at" = now()
WHERE p."kind" = 'upgrade'
  AND p."status" = 'pending'
  AND p."transaction_id" IS NULL
  AND EXISTS (
    SELECT 1 FROM "control"."plan_payments" AS q
    WHERE q."tenant_id" = p."tenant_id"
      AND q."kind" = 'upgrade'
      AND q."status" IN ('pending', 'needs_review')
      AND q."id" <> p."id"
      AND (q."transaction_id" IS NOT NULL OR (q."quoted_at", q."id") > (p."quoted_at", p."id"))
  );--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plan_payments_one_open_upgrade_idx" ON "control"."plan_payments" USING btree ("tenant_id") WHERE "control"."plan_payments"."kind" = 'upgrade' AND "control"."plan_payments"."status" IN ('pending', 'needs_review');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plan_payments_transaction_id_idx" ON "control"."plan_payments" USING btree ("transaction_id") WHERE "control"."plan_payments"."transaction_id" IS NOT NULL AND "control"."plan_payments"."status" <> 'rejected';
