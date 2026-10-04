import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseHandle {
  db: Database;
  close: () => Promise<void>;
}

/**
 * Connection pool settings. Every value is optional; the connector's defaults apply to any left out.
 * The application passes its validated values, so this package never reads the environment itself.
 */
export interface PoolSettings {
  /** Maximum connections in the pool. */
  max?: number;
  /** Milliseconds a query waits for a free connection before it fails. */
  connectionTimeoutMillis?: number;
  /** Milliseconds one statement may run before the database cancels it. 0 disables the limit. */
  statementTimeoutMillis?: number;
  /** Name shown for these connections in the database's activity view. */
  applicationName?: string;
}

const DEFAULT_POOL_MAX = 5;

// Connection pools. The application role must not have BYPASSRLS (DATABASE-SCHEMA §3).
export class DatabaseConnector {
  connect(connectionString: string, settings: PoolSettings = {}): DatabaseHandle {
    const pool = new pg.Pool({
      connectionString,
      max: settings.max ?? DEFAULT_POOL_MAX,
      connectionTimeoutMillis: settings.connectionTimeoutMillis,
      statement_timeout: settings.statementTimeoutMillis,
      application_name: settings.applicationName,
    });
    return {
      db: drizzle(pool, { schema }),
      close: () => pool.end(),
    };
  }
}
