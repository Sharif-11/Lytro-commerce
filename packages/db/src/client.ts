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
  /**
   * Milliseconds a transaction may stay open before the database ends the session (PostgreSQL 17's
   * transaction_timeout, DAT-23). Only on a direct connection: behind PgBouncer the pooler sets it (deploy/pgbouncer).
   */
  transactionTimeoutMillis?: number;
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
      ...(settings.transactionTimeoutMillis === undefined
        ? {}
        : { options: `-c transaction_timeout=${String(settings.transactionTimeoutMillis)}` }),
    });
    // A connection lost while idle: the pool replaces it, but an 'error' event nobody listens for ends the process.
    pool.on('error', (error) => {
      console.error(`[database] idle connection lost: ${error.message}`);
    });
    // And one lost while lent out: PostgreSQL ending a transaction held past transaction_timeout (DAT-23), a restart,
    // a failover. The query in flight fails by itself; the client then emits 'error' too, which unheard would end the
    // process. Heard here, it's logged, and the pool drops the client when it comes back.
    pool.on('connect', (client) => {
      client.on('error', (error) => {
        console.error(`[database] connection lost while in use: ${error.message}`);
      });
    });
    return {
      db: drizzle(pool, { schema }),
      close: () => pool.end(),
    };
  }
}
