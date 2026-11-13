import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PgBoss, type WorkHandler } from 'pg-boss';
import { DegradedMode } from '../../../degraded-mode/services/degraded-mode';
import { JobHeartbeats } from '../../../monitoring/services/job-heartbeats';
import { Leases } from '../../limits/services/leases';
import { runsJobs } from '../../../../config/server-role';
import { ENV } from '../../../../config/tokens';
import type { Env } from '../../../../config/env';

// MON-04 (Slice 9.4): a scheduled pass holds its name this long at most; a worker that stopped mid-pass frees it when
// it lapses, so another takes over within two passes of a quarter of an hour.
const PASS_LEASE_MS = 15 * 60_000;
// DAT-38 (Slice 9.5): how long a job degraded mode holds back waits before it is looked at again.
export const PAUSED_JOB_WAIT_SECONDS = 5 * 60;

/**
 * Owns pg-boss's lifecycle and its own connection pool, kept separate from the app's request pool so continuous
 * polling and listening never competes with request traffic. pg-boss manages its schema (`pgboss`) itself; the
 * app role's CREATE on that one schema is the narrow exception that lets it do so (migration 0020).
 */
@Injectable()
export class PgBossClient implements OnModuleInit, OnModuleDestroy {
  readonly boss: PgBoss;
  // D9-11: only a process that runs jobs starts the queue. An API process leaves it stopped, holds none of its
  // connections, and never sends to it: its jobs reach the queue through the outbox and the worker's relay.
  private readonly starts: boolean;
  private started = false;
  private readonly logger = new Logger('PgBossClient');

  constructor(
    @Inject(ENV) env: Pick<Env, 'DATABASE_URL'> & Partial<Pick<Env, 'SERVER_ROLE'>>,
    @Optional() @Inject(Leases) private readonly leases?: Pick<Leases, 'hold'>,
    @Optional() @Inject(DegradedMode) private readonly degraded?: Pick<DegradedMode, 'pauses'>,
    @Optional()
    @Inject(JobHeartbeats)
    private readonly heartbeats?: Pick<JobHeartbeats, 'finished'>,
  ) {
    this.starts = runsJobs(env.SERVER_ROLE ?? 'all');
    this.boss = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: 'pgboss',
      // Low latency where a queue opts in (`notify: true` on createQueue); polling is the fallback (D25).
      useListenNotify: true,
      max: 5,
      application_name: 'lytronix-queue',
    });
    // An 'error' event nobody listens for ends the process, so one slow or lost connection would take the whole
    // server down. pg-boss tries again by itself, so all this has to do is say what happened.
    this.boss.on('error', (error: Error & { queue?: string }) => {
      console.error(`[job-queue] ${error.queue ? `${error.queue}: ` : ''}${error.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.starts) return;
    await this.boss.start();
    this.started = true;
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.started) return;
    await this.boss.stop();
  }

  /**
   * DAT-38, D9-14 (Slice 9.5): a queue degraded mode can hold back (DegradedMode's PAUSED_QUEUES). While it's on, each
   * job is put back to be looked at again in a few minutes, the same work, instead of running now; it never counts as a
   * failure or uses up a retry. Off, the jobs run as `work` runs them.
   */
  workPausable<T extends object>(name: string, handler: WorkHandler<T>): Promise<string> {
    return this.boss.work<T>(name, async (jobs) => {
      if (this.degraded && (await this.degraded.pauses(name))) {
        for (const job of jobs) {
          await this.boss.send(name, job.data, { startAfter: PAUSED_JOB_WAIT_SECONDS });
        }
        this.logger.log(
          `${name}: degraded mode is on, so ${String(jobs.length)} job(s) wait ${String(PAUSED_JOB_WAIT_SECONDS)} s`,
        );
        return;
      }
      await handler(jobs);
    });
  }

  /**
   * MON-04, D9-15 (Slice 9.4): a scheduled pass, never two at once however many workers run: each run holds the queue's
   * lease while it works, and a run that finds it held (the last one still going on another worker) is skipped. pg-boss
   * already makes one job per schedule tick; this keeps consecutive ticks apart. OBS-02 (Slice 9.6): each pass that ran
   * and finished records its heartbeat, which the jobs' check (/health/jobs) holds against the schedule.
   */
  workOnce<T = object>(name: string, handler: WorkHandler<T>): Promise<string> {
    return this.boss.work<T>(name, async (jobs) => {
      if (!this.leases) {
        await handler(jobs);
        await this.heartbeats?.finished(name);
        return;
      }
      const run = await this.leases.hold(`job:${name}`, PASS_LEASE_MS, () => handler(jobs));
      if (run.held) await this.heartbeats?.finished(name);
      else
        this.logger.log(
          `${name}: the last pass is still running on another worker; this one skipped`,
        );
    });
  }
}
