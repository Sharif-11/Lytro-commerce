-- outside-transaction
-- Phase 9 Slice 9.10 (staging's recheck, 2026-11-18): the job relay claims the jobs not sent yet every 2 seconds, and
-- its query walked every job ever sent to find them, the database's costliest query under load. This index holds the
-- unsent ones alone, so the claim reads only what it may claim. (0142 lets the relay delete what it sent a week ago.)
CREATE INDEX CONCURRENTLY IF NOT EXISTS job_outbox_unsent_idx ON control.job_outbox (id) WHERE status IN ('pending', 'sending');
