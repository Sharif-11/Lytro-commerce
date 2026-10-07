-- STF-02: the staff limit counts the owner, so Starter allows two staff in total (owner plus one). The seed in 0003
-- left the key out. Trial already has staff = 1 (the owner only). Only the Starter row changes.
UPDATE control.plans
SET limits = jsonb_set(limits, '{staff}', '2'::jsonb)
WHERE name = 'Starter';
