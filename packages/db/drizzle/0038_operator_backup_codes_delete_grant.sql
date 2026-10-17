-- ADM-01: regenerating backup codes (OperatorAuthService.regenerateBackupCodes) deletes the whole old set
-- in one statement before inserting the fresh ten. Migration 0024 granted the app role SELECT/INSERT/UPDATE
-- on this table but never DELETE, since nothing needed it until now.
GRANT DELETE ON control.operator_backup_codes TO lytronix_app;
