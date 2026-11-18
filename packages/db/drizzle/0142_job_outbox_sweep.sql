-- Phase 9 Slice 9.10 (staging's recheck, 2026-11-18): the job relay deletes the rows it sent over a week ago, an hour's
-- sweep at a time (JobRelay.sweepSent); a sent row is pg-boss's job from then on, and kept, the table grew with every job.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lytronix_app') THEN
    GRANT DELETE ON control.job_outbox TO lytronix_app;
  END IF;
END $$;
