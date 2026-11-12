import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { DatabaseConnector, type DatabaseHandle, type PoolSettings } from '@lytronix/db';
import { ENV } from '../config/tokens';
import type { Env } from '../config/env';

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
 * Owns the connection pool for the application role. Closed at the very last step of shutting down, so whatever
 * still writes while the modules stop (the API request counts' last flush, RED-04) finds it open.
 */
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly handle: DatabaseHandle;

  constructor(@Inject(ENV) env: Env) {
    this.handle = new DatabaseConnector().connect(env.DATABASE_URL, {
      max: env.DATABASE_POOL_MAX,
      connectionTimeoutMillis: env.DATABASE_CONNECT_TIMEOUT_MS,
      ...connectionLimitsOf(env),
      applicationName: 'lytronix-server',
    });
  }

  onApplicationShutdown(): Promise<void> {
    return this.handle.close();
  }
}
