import { sql } from 'drizzle-orm';
import type { Database } from './client';

/** What a pool's server is (DAT-44): the primary, or a standby replaying the primary's changes. */
export type DatabaseServing = 'primary' | 'standby';

/**
 * Asks a pool's server what it is (D9-21, DAT-44): the ready check and the write pool's watch use it. A pool that
 * can't be reached rejects, which the caller reads as unreachable.
 */
export class DatabaseProbe {
  async serving(db: Database): Promise<DatabaseServing> {
    const result = await db.execute<{ standby: boolean }>(
      sql`SELECT pg_is_in_recovery() AS standby`,
    );
    return result.rows[0]?.standby === true ? 'standby' : 'primary';
  }
}
