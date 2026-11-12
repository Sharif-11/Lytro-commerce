import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import { runsJobs } from '../../../../config/server-role';
import { ENV } from '../../../../config/tokens';
import type { Env } from '../../../../config/env';

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

  constructor(@Inject(ENV) env: Pick<Env, 'DATABASE_URL'> & Partial<Pick<Env, 'SERVER_ROLE'>>) {
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
}
