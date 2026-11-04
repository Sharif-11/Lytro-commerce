-- CUS-09: a privacy delete takes the number a customer paid from off the payments that hold it, as it does off their
-- payment sessions and receipts. The transaction ID and the amount stay, and the number can only ever be emptied.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT UPDATE (sender_number) ON tenant.payments TO lytronix_app;
  END IF;
END $$;
--> statement-breakpoint
-- A voided or refunded payment keeps everything else it recorded, so emptying the number alone still reaches it.
CREATE OR REPLACE FUNCTION tenant.guard_payment() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sender_number IS DISTINCT FROM OLD.sender_number THEN
    IF NEW.sender_number IS NOT NULL THEN
      RAISE EXCEPTION 'a payment''s sender number can only be emptied'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'payments_kept';
    END IF;
    IF to_jsonb(NEW) - 'sender_number' = to_jsonb(OLD) - 'sender_number' THEN
      RETURN NEW;
    END IF;
  END IF;
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
