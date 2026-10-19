CREATE TYPE "tenant"."ledger_entry_type" AS ENUM('top_up', 'sms', 'ai', 'extraction', 'fraud_check', 'order_fee', 'product_fee', 'plan_payment', 'adjustment', 'reversal', 'carry_over');--> statement-breakpoint
ALTER TABLE "tenant"."balance_ledger" ALTER COLUMN "type" SET DATA TYPE "tenant"."ledger_entry_type" USING "type"::"tenant"."ledger_entry_type";--> statement-breakpoint
ALTER TABLE "tenant"."balance_ledger" ALTER COLUMN "balance_after" SET DEFAULT '0';--> statement-breakpoint
-- New entries only: an entry is never changed (BAL-02), so one written before this stays exactly as it was, and the
-- migration never fails on old data.
ALTER TABLE "tenant"."balance_ledger" ADD CONSTRAINT "balance_ledger_amount_nonzero" CHECK ("tenant"."balance_ledger"."amount" <> 0) NOT VALID;--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written triggers (not expressible in Drizzle). Reviewed with the schema above.
-- BAL-02, BAL-11, DAT-10: the database keeps a tenant's balance from its ledger, the way 0054 keeps a variant's
-- stock level from its movements.
-- ---------------------------------------------------------------------------------------------

-- BAL-02, BAL-11: an entry is the only way a balance moves. Before it is stored, this locks the tenant's row (so
-- concurrent entries for one tenant apply one after the other), fills balance_after and moves the balance to it.
-- BalanceService has already locked the same row in this transaction to check the frozen flag and the overdraft
-- floor (BAL-07, BAL-08, BAL-10), so the balance it checked is the balance moved here. Runs as the caller.
CREATE FUNCTION tenant.apply_balance_entry() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  held numeric(12, 2);
BEGIN
  SELECT t.balance_amount INTO held FROM control.tenants t WHERE t.id = NEW.tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant % does not exist', NEW.tenant_id
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'balance_ledger_tenant';
  END IF;
  NEW.balance_after := held + NEW.amount;
  UPDATE control.tenants SET balance_amount = NEW.balance_after WHERE id = NEW.tenant_id;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER balance_ledger_apply BEFORE INSERT ON tenant.balance_ledger
  FOR EACH ROW EXECUTE FUNCTION tenant.apply_balance_entry();
--> statement-breakpoint
-- BAL-02: a balance never changes except through an entry, for every role. Only the entry trigger's own write (one
-- trigger level deeper) may move it; a tenant is otherwise created with a zero balance and keeps what its entries
-- made it. The application role still updates the tenant row's other columns.
CREATE FUNCTION control.guard_balance_amount() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'INSERT' AND NEW.balance_amount <> 0)
     OR (TG_OP = 'UPDATE' AND NEW.balance_amount IS DISTINCT FROM OLD.balance_amount) THEN
    RAISE EXCEPTION 'a balance changes only through a balance-ledger entry'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'tenants_balance_through_ledger';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER tenants_balance_guard BEFORE INSERT OR UPDATE OF balance_amount ON control.tenants
  FOR EACH ROW EXECUTE FUNCTION control.guard_balance_amount();
--> statement-breakpoint
-- DAT-10, BAL-02, INV-03: row triggers never see a TRUNCATE, so each append-only table refuses one outright, for
-- every role. LIF-19's day-60 deletion removes a lapsed shop's movements row by row and never truncates.
CREATE TRIGGER activity_log_no_truncate BEFORE TRUNCATE ON tenant.activity_log
  FOR EACH STATEMENT EXECUTE FUNCTION tenant.reject_mutation();
--> statement-breakpoint
CREATE TRIGGER balance_ledger_no_truncate BEFORE TRUNCATE ON tenant.balance_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION tenant.reject_mutation();
--> statement-breakpoint
CREATE TRIGGER stock_movements_no_truncate BEFORE TRUNCATE ON tenant.stock_movements
  FOR EACH STATEMENT EXECUTE FUNCTION tenant.reject_mutation();
