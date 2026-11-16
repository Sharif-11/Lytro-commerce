-- The load test's operator account goes when the server is disarmed (deploy/load/run/disarm.sh), with what refers to it:
-- its sessions, backup codes and sign-in failures. The audit log keeps its entries, which name it by ID. Its password was
-- a throwaway that only the roster held. Run as the database's owner.
\set ON_ERROR_STOP on

BEGIN;
CREATE TEMP TABLE leaving ON COMMIT DROP AS
SELECT id FROM control.operator_accounts WHERE email LIKE 'load-test-%';
DELETE FROM control.operator_backup_codes WHERE operator_id IN (SELECT id FROM leaving);
DELETE FROM control.operator_sessions WHERE operator_id IN (SELECT id FROM leaving);
DELETE FROM control.sign_in_failures WHERE operator_id IN (SELECT id FROM leaving);
DELETE FROM control.operator_accounts WHERE id IN (SELECT id FROM leaving);
SELECT count(*) AS operators_removed FROM leaving;
COMMIT;
