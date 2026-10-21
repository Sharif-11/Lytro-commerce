import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { DatabaseConnector, type DatabaseHandle } from '@lytronix/db';
import { ENV } from '../config/tokens';
import type { Env } from '../config/env';

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
      statementTimeoutMillis: env.DATABASE_STATEMENT_TIMEOUT_MS,
      applicationName: 'lytronix-server',
    });
  }

  onApplicationShutdown(): Promise<void> {
    return this.handle.close();
  }
}
