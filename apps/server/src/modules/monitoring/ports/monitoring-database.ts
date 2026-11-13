import type { ArchiveState, ScheduledJobBeat } from '@lytronix/db';

/** The job heartbeats' table (migration 0134), pg-boss's schedule and the archive's state (Slice 9.6). */
export interface MonitoringDatabase {
  recordHeartbeat(name: string, at: Date): Promise<void>;
  /** When each named job last finished; a name never recorded is missing. */
  heartbeatsOf(names: readonly string[]): Promise<Map<string, Date>>;
  scheduledJobs(): Promise<ScheduledJobBeat[]>;
  /** Read on the primary. */
  archive(): Promise<ArchiveState>;
}
