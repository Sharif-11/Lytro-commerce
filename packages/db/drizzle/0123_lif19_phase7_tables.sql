-- LIF-19, ADM-13 (Phase 8 Slice 8.3): a deleted shop's SMS log and settings, fraud checks and rule, and reads of pasted
-- delivery details go with the rest of its data. Phase 7 gave the app no way to delete these rows, and three of the five
-- are append-only by that grant, so the grant comes with a guard: a row goes only when the transaction names its shop as
-- being erased (app.erasing_tenant) and that shop is archived or deleted, the rule the stock ledger has had since 0054.
CREATE FUNCTION tenant.guard_erasing_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.erasing_tenant', true) = OLD.tenant_id::text
     AND EXISTS (
       SELECT 1 FROM control.tenants t WHERE t.id = OLD.tenant_id AND t.state IN ('archived', 'deleted')
     ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% rows go only with their shop', TG_TABLE_NAME
    USING ERRCODE = 'check_violation', CONSTRAINT = 'deleted_only_with_shop';
END $$;
--> statement-breakpoint
CREATE TRIGGER sms_log_deleted_only_with_shop BEFORE DELETE ON tenant.sms_log
  FOR EACH ROW EXECUTE FUNCTION tenant.guard_erasing_only();
--> statement-breakpoint
CREATE TRIGGER sms_settings_deleted_only_with_shop BEFORE DELETE ON tenant.sms_settings
  FOR EACH ROW EXECUTE FUNCTION tenant.guard_erasing_only();
--> statement-breakpoint
CREATE TRIGGER fraud_checks_deleted_only_with_shop BEFORE DELETE ON tenant.fraud_checks
  FOR EACH ROW EXECUTE FUNCTION tenant.guard_erasing_only();
--> statement-breakpoint
CREATE TRIGGER fraud_rules_deleted_only_with_shop BEFORE DELETE ON tenant.fraud_rules
  FOR EACH ROW EXECUTE FUNCTION tenant.guard_erasing_only();
--> statement-breakpoint
CREATE TRIGGER order_extractions_deleted_only_with_shop BEFORE DELETE ON tenant.order_extractions
  FOR EACH ROW EXECUTE FUNCTION tenant.guard_erasing_only();
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT DELETE ON tenant.sms_log, tenant.sms_settings, tenant.fraud_checks, tenant.fraud_rules,
      tenant.order_extractions TO lytronix_app;
  END IF;
END $$;
