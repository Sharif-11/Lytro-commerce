import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseHandle {
  db: Database;
  close: () => Promise<void>;
}

/** Creates connection pools. The application role must not have BYPASSRLS (DATABASE-SCHEMA §3). */
export class DatabaseConnector {
  connect(connectionString: string): DatabaseHandle {
    const pool = new pg.Pool({ connectionString, max: 5 });
    return {
      db: drizzle(pool, { schema }),
      close: () => pool.end(),
    };
  }
}
