import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { DatabaseConnector, type DatabaseHandle, type PoolSettings } from '@lytronix/db';
import { ENV } from '../config/tokens';
import type { Env } from '../config/env';
import { isLostConnection } from './lost-connection';

type LimitSettings = Pick<
  Env,
  'DATABASE_THROUGH_POOLER' | 'DATABASE_STATEMENT_TIMEOUT_MS' | 'DATABASE_TRANSACTION_TIMEOUT_MS'
>;

/**
 * DAT-23's limits, sent by the server only when it connects directly (the worker's). Behind PgBouncer (the API's) the
 * pooler sets them on every connection it opens (deploy/pgbouncer), and would refuse the connection had they been sent.
 */
export function connectionLimitsOf(
  env: LimitSettings,
): Pick<PoolSettings, 'statementTimeoutMillis' | 'transactionTimeoutMillis'> {
  if (env.DATABASE_THROUGH_POOLER) return {};
  return {
    statementTimeoutMillis: env.DATABASE_STATEMENT_TIMEOUT_MS,
    ...(env.DATABASE_TRANSACTION_TIMEOUT_MS === undefined
      ? {}
      : { transactionTimeoutMillis: env.DATABASE_TRANSACTION_TIMEOUT_MS }),
  };
}

/**
 * Owns the connection pools. Closed at the very last step of shutting down, so whatever still writes while the modules
 * stop (the API request counts' last flush, RED-04) finds them open.
 *
 * D9-13, DAT-44: two pools. `handle` writes, always on the primary, and is what everything uses unless it says
 * otherwise. `reads` is for code marked as a read: the read-only role (DAT-45), on the primary until a standby exists.
 * Without a read address (a developer's database) it is the write pool itself.
 */
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly handle: DatabaseHandle;
  readonly reads: DatabaseHandle;

  constructor(@Inject(ENV) env: Env) {
    const connector = new DatabaseConnector();
    const shared = {
      max: env.DATABASE_POOL_MAX,
      connectionTimeoutMillis: env.DATABASE_CONNECT_TIMEOUT_MS,
      ...connectionLimitsOf(env),
    };
    this.handle = connector.connect(env.DATABASE_URL, {
      ...shared,
      applicationName: 'lytronix-server',
    });
    this.reads =
      env.DATABASE_READ_URL === undefined
        ? this.handle
        : connector.connect(env.DATABASE_READ_URL, {
            ...shared,
            applicationName: 'lytronix-server-reads',
          });
  }

  /**
   * DAT-23: a read whose connection was lost under it (a restart, a failover, a dropped link) is tried once more, on a
   * fresh connection. Only reads: a write is retried by its caller's idempotency key, never here.
   */
  async readRetrying<T>(read: () => Promise<T>): Promise<T> {
    try {
      return await read();
    } catch (error) {
      if (!isLostConnection(error)) throw error;
      return read();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.reads !== this.handle) await this.reads.close();
    await this.handle.close();
  }
}
