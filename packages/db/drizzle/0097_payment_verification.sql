CREATE TYPE "tenant"."verification_level" AS ENUM('manual', 'listener', 'gateway');--> statement-breakpoint
CREATE TYPE "tenant"."payment_reject_reason" AS ENUM('no_payment_found', 'transaction_id_used', 'other');--> statement-breakpoint
ALTER TABLE "control"."tenants" ADD COLUMN "new_shop_cap" boolean;--> statement-breakpoint
ALTER TABLE "tenant"."payments" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "tenant"."payments" ADD COLUMN "verification_level" "tenant"."verification_level" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant"."payments" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant"."payments" ADD COLUMN "refunded_by" uuid;--> statement-breakpoint
ALTER TABLE "tenant"."payments" ADD COLUMN "refund_note" varchar(500);--> statement-breakpoint
ALTER TABLE "tenant"."payment_sessions" ADD COLUMN "decided_by" uuid;--> statement-breakpoint
ALTER TABLE "tenant"."payment_sessions" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant"."payment_sessions" ADD COLUMN "reject_reason" "tenant"."payment_reject_reason";--> statement-breakpoint
ALTER TABLE "tenant"."payment_sessions" ADD COLUMN "reject_note" varchar(500);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_session_key" ON "tenant"."payments" USING btree ("tenant_id","session_id") WHERE "tenant"."payments"."session_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant"."payments" ADD CONSTRAINT "payments_refund_check" CHECK (("tenant"."payments"."refunded_at" IS NULL) = ("tenant"."payments"."refund_note" IS NULL));
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written grants, guard and data (not expressible in Drizzle). Phase 5 Slice 5.3, agreed 2026-10-31.
-- ---------------------------------------------------------------------------------------------

-- PAY-20: a payment may be marked refunded, as it may be voided; nothing else about it changes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT UPDATE (refunded_at, refunded_by, refund_note) ON tenant.payments TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- ...once: a voided payment stays void and a refunded one stays refunded, so neither becomes the other.
CREATE OR REPLACE FUNCTION tenant.guard_payment() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'a voided payment stays void'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_kept';
  END IF;
  IF OLD.refunded_at IS NOT NULL THEN
    RAISE EXCEPTION 'a refunded payment stays refunded'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_kept';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
-- VER-02 (one shape for every ID): the registry matches IDs ignoring case, so every ID it holds is kept in capitals. Of
-- an ID held twice only by case, the first use stays.
DELETE FROM control.used_transaction_ids AS later
  USING control.used_transaction_ids AS earlier
  WHERE upper(later.transaction_id) = upper(earlier.transaction_id)
    AND later.transaction_id <> earlier.transaction_id
    AND (earlier.first_used_at, earlier.transaction_id) < (later.first_used_at, later.transaction_id);
--> statement-breakpoint
UPDATE control.used_transaction_ids SET transaction_id = upper(transaction_id)
  WHERE transaction_id <> upper(transaction_id);
