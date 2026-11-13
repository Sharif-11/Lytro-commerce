import { Inject, Injectable } from '@nestjs/common';
import type { ArchiveState, ScheduledJobBeat } from '@lytronix/db';
import { CronExpressionParser } from 'cron-parser';
import type { MonitoringDatabase } from '../ports/monitoring-database';
import { MONITORING_CLOCK, MONITORING_DATABASE } from '../tokens';

/**
 * OBS-02: how long after its tick a scheduled job may take to finish the pass before it counts as missed. A pass holds
 * its lease for up to 15 minutes (PgBossClient), and a worker that stopped mid-pass frees it when that lapses.
 */
export const JOB_GRACE_MS = 20 * 60_000;
/** DAT-27: the newest nightly dump and the newest base backup are each at most 26 hours old. */
export const BACKUP_MAX_AGE_MS = 26 * 60 * 60_000;
/** DAT-27: the write-ahead-log archive no more than 5 minutes behind. */
export const ARCHIVE_MAX_LAG_MS = 5 * 60_000;
/** The nightly backups' heartbeats, written by deploy/database/bin/lytro-nightly under these same names. */
export const BACKUP_HEARTBEATS = ['backup:dump', 'backup:base'] as const;
/** The write-ahead-log archive, as the report names it. */
export const ARCHIVE_CHECK = 'backup:archive';

export interface JobsReport {
  status: 'ok' | 'overdue';
  /** Every job, backup and the archive found late, by name. */
  overdue: string[];
}

/** The latest tick of a cron at or before a moment, in its time zone; null if the cron can't be read. */
function lastTick(job: ScheduledJobBeat, before: Date): Date | null {
  try {
    return CronExpressionParser.parse(job.cron, { currentDate: before, tz: job.timezone })
      .prev()
      .toDate();
  } catch {
    return null;
  }
}

/** A write-ahead-log file's place in the sequence (its log and segment numbers, 16 MB segments); null for another file. */
function walIndex(name: string | null): number | null {
  if (name === null || !/^[0-9A-F]{24}$/.test(name)) return null;
  return parseInt(name.slice(8, 16), 16) * 0x100 + parseInt(name.slice(16, 24), 16);
}

/**
 * OBS-02, DAT-27, DAT-25 (Slice 9.6): every scheduled job finished its last due pass, and, once the backups are set up
 * (deploy.sh turns `archive_mode` on exactly then), the nightly dump and base backup are recent and the archive keeps up.
 * One page for the uptime check to watch (/health/jobs): it fails while anything is late.
 */
@Injectable()
export class JobsCheck {
  constructor(
    @Inject(MONITORING_DATABASE)
    private readonly database: Pick<
      MonitoringDatabase,
      'heartbeatsOf' | 'scheduledJobs' | 'archive'
    >,
    @Inject(MONITORING_CLOCK) private readonly clock: () => Date,
  ) {}

  async report(): Promise<JobsReport> {
    const now = this.clock();
    const [jobs, archive] = await Promise.all([
      this.database.scheduledJobs(),
      this.database.archive(),
    ]);
    const overdue = new Set(jobs.filter((job) => this.missedPass(job, now)).map((job) => job.name));
    if (archive.mode === 'on') {
      const beats = await this.database.heartbeatsOf(BACKUP_HEARTBEATS);
      for (const name of BACKUP_HEARTBEATS) {
        const at = beats.get(name);
        if (at === undefined || now.getTime() - at.getTime() > BACKUP_MAX_AGE_MS) overdue.add(name);
      }
      if (this.archiveBehind(archive, now)) overdue.add(ARCHIVE_CHECK);
    }
    return { status: overdue.size === 0 ? 'ok' : 'overdue', overdue: [...overdue].sort() };
  }

  /**
   * The job's latest tick at least the grace ago has no pass finished after it. A tick before the schedule was made was
   * never due. A cron that can't be read counts as missed: nothing can say it ran.
   */
  private missedPass(job: ScheduledJobBeat, now: Date): boolean {
    const tick = lastTick(job, new Date(now.getTime() - JOB_GRACE_MS));
    if (tick === null) return true;
    if (tick < job.scheduledSince) return false;
    return job.finishedAt === null || job.finishedAt < tick;
  }

  /**
   * The newest attempt to archive failed, or a finished file waits (the one being written isn't due yet) while nothing
   * has been archived for longer than the limit.
   */
  private archiveBehind(archive: ArchiveState, now: Date): boolean {
    const { lastArchivedAt, lastFailedAt } = archive;
    if (lastFailedAt !== null && (lastArchivedAt === null || lastFailedAt > lastArchivedAt))
      return true;
    const current = walIndex(archive.currentWal);
    const archived = walIndex(archive.lastArchivedWal);
    if (current === null || archived === null || lastArchivedAt === null) return false;
    return current - archived > 1 && now.getTime() - lastArchivedAt.getTime() > ARCHIVE_MAX_LAG_MS;
  }
}
