import { afterAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { TestDatabasePreparer } from '../src/prepare-database';
import { ADMIN_URL } from './config';
import { connect } from './helpers';

// Test suites start side by side and share the cluster's roles: making or changing them must take turns, or Postgres's
// catalog answers "tuple concurrently updated" (a deploy's verify failed on it, 2026-11-13).
const SIDE_BY_SIDE = 16;
const ROUNDS = 5;
const clients: pg.Client[] = [];

afterAll(async () => {
  for (const client of clients) await client.end();
});

describe('preparing test databases side by side', () => {
  it('makes and changes the shared roles one suite at a time, never colliding', async () => {
    for (let index = 0; index < SIDE_BY_SIDE; index += 1) clients.push(await connect(ADMIN_URL));
    const preparer = new TestDatabasePreparer();
    for (let round = 0; round < ROUNDS; round += 1) {
      await Promise.all(clients.map((client) => preparer.ensureRoles(client)));
    }
    const read = await clients[0]?.query<{ settings: string[] }>(
      `SELECT setconfig AS settings FROM pg_db_role_setting s JOIN pg_roles r ON r.oid = s.setrole
       WHERE r.rolname = 'lytronix_read' AND s.setdatabase = 0`,
    );
    expect(read?.rows[0]?.settings).toContain('default_transaction_read_only=on');
  });
});
