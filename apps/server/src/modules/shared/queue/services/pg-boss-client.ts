import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PgBoss } from 'pg-boss';
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

  constructor(@Inject(ENV) env: Pick<Env, 'DATABASE_URL'>) {
    this.boss = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: 'pgboss',
      // Low latency where a queue opts in (`notify: true` on createQueue); polling is the fallback (D25).
      useListenNotify: true,
      max: 5,
      application_name: 'lytronix-queue',
    });
  }

  async onModuleInit(): Promise<void> {
    await this.boss.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss.stop();
  }
}
