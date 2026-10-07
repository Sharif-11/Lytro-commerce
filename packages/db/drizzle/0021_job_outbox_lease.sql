ALTER TABLE "control"."job_outbox" ADD COLUMN "lease_until" timestamp with time zone;-- Added after 0019 (should have been generated together): the relay's claim lease, same shape as the SMS
-- outbox's own lease column.
