import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { DatabaseConnector, type DatabaseHandle } from '@lytronix/db';
import { ENV } from '../config/tokens';
import type { Env } from '../config/env';

/** Owns the connection pool for the application role. Closed when the application shuts down. */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly handle: DatabaseHandle;

  constructor(@Inject(ENV) env: Env) {
    this.handle = new DatabaseConnector().connect(env.DATABASE_URL, {
      max: env.DATABASE_POOL_MAX,
      connectionTimeoutMillis: env.DATABASE_CONNECT_TIMEOUT_MS,
      statementTimeoutMillis: env.DATABASE_STATEMENT_TIMEOUT_MS,
      applicationName: 'lytronix-server',
    });
  }

  onModuleDestroy(): Promise<void> {
    return this.handle.close();
  }
}
