import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { DatabaseConnector, type DatabaseHandle } from '../src/index';

import { ADMIN_URL, testDbUrl } from './config';
import { connect } from './helpers';

// Slice 9.2 (DAT-23): a direct connection (the worker's) may cap how long a transaction stays open, PostgreSQL 17's
// transaction_timeout. The database ends the session however quick each statement inside was. CI runs 17, as staging
// and production do; a developer's 16 doesn't know the setting, so the case is skipped there.
let probe: pg.Client;
let handle: DatabaseHandle | undefined;

beforeAll(async () => {
  probe = await connect(testDbUrl(ADMIN_URL));
  const { rows } = await probe.query<{ version: number }>(
    `SELECT current_setting('server_version_num')::int AS version`,
  );
  if ((rows[0]?.version ?? 0) >= 170000) {
    handle = new DatabaseConnector().connect(testDbUrl(ADMIN_URL), {
      max: 1,
      transactionTimeoutMillis: 300,
    });
  }
});

afterAll(async () => {
  await handle?.close();
  await probe.end();
});

describe('a transaction held open past its limit (DAT-23)', () => {
  it('is ended by the database, however quick each statement in it is', async (context) => {
    if (!handle) {
      context.skip();
      return;
    }
    const { db } = handle;
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_sleep(0.2)`);
        await tx.execute(sql`SELECT pg_sleep(0.2)`);
        await tx.execute(sql`SELECT pg_sleep(0.2)`);
      }),
    ).rejects.toThrow();
  });

  it('leaves a quick transaction alone', async (context) => {
    if (!handle) {
      context.skip();
      return;
    }
    const { db } = handle;
    const answer = await db.transaction((tx) => tx.execute(sql`SELECT 1 AS one`));
    expect(answer.rows).toEqual([{ one: 1 }]);
  });
});
