import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createDatabase, type DatabaseHandle } from '@lytronix/db';
import { ENV } from '../config/tokens';
import type { Env } from '../config/env';

/** Owns the connection pool for the application role. Closed when the application shuts down. */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly handle: DatabaseHandle;

  constructor(@Inject(ENV) env: Env) {
    this.handle = createDatabase(env.DATABASE_URL);
  }

  onModuleDestroy(): Promise<void> {
    return this.handle.close();
  }
}
