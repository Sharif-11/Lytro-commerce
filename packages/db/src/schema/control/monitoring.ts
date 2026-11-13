import { text, timestamp } from 'drizzle-orm/pg-core';
import { control } from '../shared';

// OBS-02, DAT-27 (Slice 9.6): when each scheduled job last finished a pass, and each night's backups (written by the
// database image's own scripts, deploy/database/bin/lytro-nightly). The jobs' check (/health/jobs) compares it with
// when each should have run, from pg-boss's own schedule, so a job that stops finishing is found without a list of
// jobs kept twice. One row per job, overwritten.
export const jobHeartbeats = control.table('job_heartbeats', {
  name: text('name').primaryKey(),
  finishedAt: timestamp('finished_at', { withTimezone: true }).notNull(),
});

export type SelectJobHeartbeat = typeof jobHeartbeats.$inferSelect;
