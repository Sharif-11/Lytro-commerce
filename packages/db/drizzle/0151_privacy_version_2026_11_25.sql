-- LEG-01, MKT-01 to MKT-03 (2026-11-24): privacy policy version 2026-11-25 names Lytro's own Meta pixel and its
-- cookies, so every account created from now on records it. An earlier account keeps the version it accepted.
-- reference-data: privacy_version moves to the newest published version, as 0133 set the first.
-- The previous release reads the setting without checking it (only an operator's change is checked). After a
-- rollback a new account would record 2026-11-25 while that release's website shows 2026-11-20, its newest text.
UPDATE control.platform_settings SET value = '"2026-11-25"', updated_by = NULL, updated_at = now()
WHERE key = 'privacy_version';
