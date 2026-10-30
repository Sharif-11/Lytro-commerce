ALTER TABLE "tenant"."payments" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant"."payments" ADD COLUMN "voided_by" uuid;--> statement-breakpoint
ALTER TABLE "tenant"."payments" ADD COLUMN "void_reason" varchar(500);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_live_transaction_key" ON "tenant"."payments" USING btree ("tenant_id","transaction_id") WHERE "tenant"."payments"."transaction_id" IS NOT NULL AND "tenant"."payments"."voided_at" IS NULL;--> statement-breakpoint
ALTER TABLE "tenant"."payments" ADD CONSTRAINT "payments_void_check" CHECK (("tenant"."payments"."voided_at" IS NULL) = ("tenant"."payments"."void_reason" IS NULL));
--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written grants and guard (not expressible in Drizzle). Phase 4 Slice 4.3b, agreed 2026-10-30.
-- ---------------------------------------------------------------------------------------------

-- A payment changes only by being voided: its amount, method, references and verification never change.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT UPDATE (voided_at, voided_by, void_reason) ON tenant.payments TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- ...and only once: a voided payment stays void.
CREATE FUNCTION tenant.guard_payment() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'a voided payment stays void'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_kept';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER payments_guard BEFORE UPDATE ON tenant.payments
  FOR EACH ROW EXECUTE FUNCTION tenant.guard_payment();
