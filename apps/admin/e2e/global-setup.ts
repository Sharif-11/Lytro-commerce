import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareE2eDatabase, startBackend } from './support/backend';
import { startHostProxy } from './support/host-proxy';
import { BACKEND_PORT, PROXY_PORT } from './support/ports';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.resolve(HERE, '.tmp');
export const STATE_FILE = path.join(STATE_DIR, 'state.json');
export const SMS_LOG_FILE = path.join(STATE_DIR, 'backend.log');
const DIST_DIR = path.resolve(HERE, '../dist');

export interface E2eState {
  backendPid: number;
  adminDbUrl: string;
  dbName: string;
  smsLogFile: string;
}

export default async function globalSetup(): Promise<void> {
  const adminUrl = process.env['DATABASE_TEST_ADMIN_URL'];
  if (!adminUrl) {
    throw new Error(
      'DATABASE_TEST_ADMIN_URL is required for the admin E2E suite (same Postgres the server e2e specs use).',
    );
  }
  if (!existsSync(path.join(DIST_DIR, 'index.html'))) {
    throw new Error(
      `No build at ${DIST_DIR} — run "pnpm build" in apps/admin before the E2E suite.`,
    );
  }

  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(SMS_LOG_FILE, '', 'utf-8');

  const dbName = `lytronix_admin_e2e_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const { adminDbUrl, appDbUrl } = await prepareE2eDatabase(adminUrl, dbName);
  const backendPid = await startBackend(appDbUrl, BACKEND_PORT, SMS_LOG_FILE);
  await startHostProxy(DIST_DIR, BACKEND_PORT, PROXY_PORT);

  const state: E2eState = { backendPid, adminDbUrl, dbName, smsLogFile: SMS_LOG_FILE };
  writeFileSync(STATE_FILE, JSON.stringify(state), 'utf-8');
}
