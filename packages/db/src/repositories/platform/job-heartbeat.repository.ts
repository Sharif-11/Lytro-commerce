import { inArray, sql } from 'drizzle-orm';
import type { Executor } from '../../transactions';
import { jobHeartbeats } from '../../schema';

/** A scheduled job as pg-boss keeps it, with when it last finished a pass (null: never). */
export interface ScheduledJobBeat {
  name: string;
  cron: string;
  timezone: string;
  /** When the schedule was made: a tick before it was never due. */
  scheduledSince: Date;
  finishedAt: Date | null;
}

/** The database's write-ahead-log archive as PostgreSQL reports it (`pg_stat_archiver`). */
export interface ArchiveState {
  /** `archive_mode`: 'on' once deploy.sh finds the backups set up (Slice 9.3), 'off' before. */
  mode: string;
  /** The file being written now; it's archived after it fills or archive_timeout passes. */
  currentWal: string;
  lastArchivedWal: string | null;
  lastArchivedAt: Date | null;
  lastFailedAt: Date | null;
}

const dateOf = (value: Date | string | null): Date | null =>
  value === null ? null : new Date(value);

/**
 * OBS-02, DAT-27 (Slice 9.6): each job's last finished pass, and what the jobs' check compares it with: pg-boss's own
 * schedule (the crons the workers registered) and the write-ahead-log archive's state.
 */
export class JobHeartbeatRepository {
  /** Records that a job finished a pass now. */
  async record(db: Executor, name: string, at: Date): Promise<void> {
    await db
      .insert(jobHeartbeats)
      .values({ name, finishedAt: at })
      .onConflictDoUpdate({ target: jobHeartbeats.name, set: { finishedAt: at } });
  }

  /** When each named job last finished; a name never recorded is missing from the map. */
  async finishedAt(db: Executor, names: readonly string[]): Promise<Map<string, Date>> {
    if (names.length === 0) return new Map();
    const rows = await db
      .select()
      .from(jobHeartbeats)
      .where(inArray(jobHeartbeats.name, [...names]));
    return new Map(rows.map((row) => [row.name, new Date(row.finishedAt)]));
  }

  /** Every cron schedule pg-boss holds, each with its job's last finished pass. */
  async scheduledJobs(db: Executor): Promise<ScheduledJobBeat[]> {
    const result = await db.execute<{
      name: string;
      cron: string;
      timezone: string | null;
      created_on: Date | string;
      finished_at: Date | string | null;
    }>(sql`
      SELECT s.name, s.cron, s.timezone, s.created_on, h.finished_at
      FROM pgboss.schedule s
      LEFT JOIN ${jobHeartbeats} h ON h.name = s.name
      WHERE s.kind = 'cron'
      ORDER BY s.name
    `);
    return result.rows.map((row) => ({
      name: row.name,
      cron: row.cron,
      timezone: row.timezone ?? 'UTC',
      scheduledSince: new Date(row.created_on),
      finishedAt: dateOf(row.finished_at),
    }));
  }

  /** The archive's state. Read on the primary: a standby has no current file of its own. */
  async archive(db: Executor): Promise<ArchiveState> {
    const result = await db.execute<{
      mode: string;
      current_wal: string;
      last_archived_wal: string | null;
      last_archived_time: Date | string | null;
      last_failed_time: Date | string | null;
    }>(sql`
      SELECT current_setting('archive_mode') AS mode,
             pg_walfile_name(pg_current_wal_lsn()) AS current_wal,
             a.last_archived_wal, a.last_archived_time, a.last_failed_time
      FROM pg_stat_archiver a
    `);
    const row = result.rows[0];
    if (row === undefined) throw new Error('pg_stat_archiver returned no row');
    return {
      mode: row.mode,
      currentWal: row.current_wal,
      lastArchivedWal: row.last_archived_wal,
      lastArchivedAt: dateOf(row.last_archived_time),
      lastFailedAt: dateOf(row.last_failed_time),
    };
  }
}
