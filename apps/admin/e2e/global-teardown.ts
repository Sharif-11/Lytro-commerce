import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';
import { STATE_FILE, type E2eState } from './global-setup';

export default async function globalTeardown(): Promise<void> {
  if (!existsSync(STATE_FILE)) return;
  const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8')) as E2eState;

  try {
    process.kill(state.backendPid);
  } catch {
    // Already gone — nothing to clean up here.
  }

  const adminUrl = process.env['DATABASE_TEST_ADMIN_URL'];
  if (!adminUrl) return;
  const maintenance = new pg.Client({ connectionString: adminUrl });
  await maintenance.connect();
  try {
    await maintenance.query(`DROP DATABASE IF EXISTS ${state.dbName} WITH (FORCE)`);
  } finally {
    await maintenance.end();
  }
}
