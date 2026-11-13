import { describe, expect, it } from 'vitest';
import type { ArchiveState, ScheduledJobBeat } from '@lytronix/db';
import type { MonitoringDatabase } from '../src/modules/monitoring/ports/monitoring-database';
import {
  ARCHIVE_CHECK,
  BACKUP_MAX_AGE_MS,
  JobsCheck,
  JOB_GRACE_MS,
} from '../src/modules/monitoring/services/jobs-check';

// OBS-02, DAT-27, DAT-25 (Slice 9.6): which jobs, backups and archive states the jobs' check calls late.
const NOW = new Date('2026-11-13T10:07:00Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const LONG_AGO = new Date('2026-01-01T00:00:00Z');

const ARCHIVE_OFF: ArchiveState = {
  mode: 'off',
  currentWal: '000000010000000000000003',
  lastArchivedWal: null,
  lastArchivedAt: null,
  lastFailedAt: null,
};

function job(
  name: string,
  cron: string,
  finishedAt: Date | null,
  scheduledSince = LONG_AGO,
): ScheduledJobBeat {
  return { name, cron, timezone: 'UTC', scheduledSince, finishedAt };
}

function checkOf(
  jobs: ScheduledJobBeat[],
  archive: ArchiveState = ARCHIVE_OFF,
  beats: Record<string, Date> = {},
): JobsCheck {
  const database: Pick<MonitoringDatabase, 'heartbeatsOf' | 'scheduledJobs' | 'archive'> = {
    scheduledJobs: () => Promise.resolve(jobs),
    archive: () => Promise.resolve(archive),
    heartbeatsOf: (names) =>
      Promise.resolve(
        new Map(names.flatMap((name) => (beats[name] ? [[name, beats[name]] as const] : []))),
      ),
  };
  return new JobsCheck(database, () => NOW);
}

describe('the jobs check (Slice 9.6)', () => {
  it('passes when every job finished after its last tick that is past the grace', async () => {
    // Every 5 minutes: the latest tick at least 20 minutes ago is 09:45.
    const report = await checkOf([job('every-5', '*/5 * * * *', minutesAgo(21))]).report();
    expect(report).toEqual({ status: 'ok', overdue: [] });
  });

  it('calls a job late once its tick is past the grace with no pass after it (OBS-02)', async () => {
    const report = await checkOf([
      job('stopped', '*/5 * * * *', minutesAgo(40)),
      job('never-ran', '*/5 * * * *', null),
      job('running', '*/5 * * * *', minutesAgo(1)),
    ]).report();
    expect(report).toEqual({ status: 'overdue', overdue: ['never-ran', 'stopped'] });
  });

  it('gives a pass the grace to finish: a tick within it is not yet due', async () => {
    // Hourly at :00: 10:00 is 7 minutes ago, inside the grace; 09:00 is the tick that counts.
    const report = await checkOf([
      job('hourly', '0 * * * *', new Date('2026-11-13T09:03:00Z')),
    ]).report();
    expect(report.status).toBe('ok');
    expect(JOB_GRACE_MS).toBe(20 * 60_000);
  });

  it('never calls late a tick from before the job was scheduled', async () => {
    const report = await checkOf([job('new', '0 6 * * *', null, minutesAgo(30))]).report();
    expect(report.status).toBe('ok');
  });

  it("reads a daily job's tick in its own time zone", async () => {
    // 06:00 in Dhaka is 00:00 UTC; a pass at 23:59 UTC the day before missed it.
    const dhaka = {
      ...job('daily', '0 6 * * *', new Date('2026-11-12T23:59:00Z')),
      timezone: 'Asia/Dhaka',
    };
    expect((await checkOf([dhaka]).report()).overdue).toEqual(['daily']);
    const ran = { ...dhaka, finishedAt: new Date('2026-11-13T00:04:00Z') };
    expect((await checkOf([ran]).report()).status).toBe('ok');
  });

  it("calls late a job whose cron can't be read: nothing can say it ran", async () => {
    expect((await checkOf([job('broken', 'not a cron', NOW)]).report()).overdue).toEqual([
      'broken',
    ]);
  });

  it('expects no backups while the archive is off (CI, a server not set up yet)', async () => {
    expect((await checkOf([]).report()).status).toBe('ok');
  });

  it('once backups are set up, calls a missing or 26-hour-old backup late (DAT-27)', async () => {
    const archive = { ...ARCHIVE_OFF, mode: 'on' };
    const old = new Date(NOW.getTime() - BACKUP_MAX_AGE_MS - 60_000);
    expect((await checkOf([], archive).report()).overdue).toEqual(['backup:base', 'backup:dump']);
    expect(
      (await checkOf([], archive, { 'backup:dump': minutesAgo(60), 'backup:base': old }).report())
        .overdue,
    ).toEqual(['backup:base']);
    expect(
      (
        await checkOf([], archive, {
          'backup:dump': minutesAgo(60),
          'backup:base': minutesAgo(30),
        }).report()
      ).status,
    ).toBe('ok');
  });

  describe('the write-ahead-log archive (DAT-25, DAT-27)', () => {
    const backedUp = { 'backup:dump': minutesAgo(60), 'backup:base': minutesAgo(60) };
    const archiveOf = (state: Partial<ArchiveState>) => ({ ...ARCHIVE_OFF, mode: 'on', ...state });
    const overdueOf = async (state: Partial<ArchiveState>) =>
      (await checkOf([], archiveOf(state), backedUp).report()).overdue;

    it('keeps up while only the file being written is unarchived', async () => {
      expect(
        await overdueOf({
          currentWal: '000000010000000000000004',
          lastArchivedWal: '000000010000000000000003',
          lastArchivedAt: minutesAgo(30),
        }),
      ).toEqual([]);
    });

    it('is behind when a finished file has waited past 5 minutes', async () => {
      const waiting = {
        currentWal: '000000010000000000000005',
        lastArchivedWal: '000000010000000000000003',
      };
      expect(await overdueOf({ ...waiting, lastArchivedAt: minutesAgo(6) })).toEqual([
        ARCHIVE_CHECK,
      ]);
      expect(await overdueOf({ ...waiting, lastArchivedAt: minutesAgo(2) })).toEqual([]);
    });

    it('counts across a log boundary', async () => {
      expect(
        await overdueOf({
          currentWal: '000000010000000100000001',
          lastArchivedWal: '0000000100000000000000FF',
          lastArchivedAt: minutesAgo(30),
        }),
      ).toEqual([ARCHIVE_CHECK]);
    });

    it('fails while its newest attempt failed', async () => {
      expect(
        await overdueOf({ lastArchivedAt: minutesAgo(3), lastFailedAt: minutesAgo(1) }),
      ).toEqual([ARCHIVE_CHECK]);
      expect(
        await overdueOf({ lastArchivedAt: minutesAgo(1), lastFailedAt: minutesAgo(3) }),
      ).toEqual([]);
    });
  });
});
