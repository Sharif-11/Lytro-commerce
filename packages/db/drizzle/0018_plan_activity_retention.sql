-- AUD-06: the activity log's retention per plan, in days. Trial is raised to 30 (from the SRS's bracketed [7]) to
-- match the extended trial length; Starter is 30. Growth and Pro are seeded with their own rows when those plans
-- are added.
UPDATE control.plans
SET limits = jsonb_set(limits, '{activity_retention_days}', '30'::jsonb)
WHERE name IN ('Trial', 'Starter');
