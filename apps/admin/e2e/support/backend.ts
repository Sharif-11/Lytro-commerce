import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { MigrationRunner, QueueBootstrapper } from '@lytronix/db';

// Mirrors apps/server/test/support/database.ts's prepareTestDatabase — duplicated rather than imported,
// since apps/admin and apps/server are separate packages and this is the one place the E2E harness needs
// it. Keep the two in sync if the app role or bootstrap step changes.
const APP_ROLE = 'lytronix_app';
const APP_PASSWORD = 'lytronix_app_local_only';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(HERE, '../../../server');

function withDatabase(url: string, database: string, user?: string, password?: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  if (user) parsed.username = user;
  if (password) parsed.password = password;
  return parsed.toString();
}

export async function prepareE2eDatabase(
  adminUrl: string,
  database: string,
): Promise<{ adminDbUrl: string; appDbUrl: string }> {
  const maintenance = new pg.Client({ connectionString: adminUrl });
  await maintenance.connect();
  try {
    await maintenance.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
          CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PASSWORD}' NOSUPERUSER NOBYPASSRLS;
        END IF;
      END $$`);
    await maintenance.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await maintenance.query(`CREATE DATABASE ${database}`);
  } finally {
    await maintenance.end();
  }

  const adminDbUrl = withDatabase(adminUrl, database);
  await new MigrationRunner().run(adminDbUrl);
  await new QueueBootstrapper().run(adminDbUrl);
  return { adminDbUrl, appDbUrl: withDatabase(adminUrl, database, APP_ROLE, APP_PASSWORD) };
}

/**
 * Starts the real backend as its own process, with its stdout/stderr redirected to a log file rather than
 * inherited — `globalSetup` runs in a process separate from the test workers that actually need the OTP
 * codes this process prints (ConsoleSmsProvider), so anything kept only in this process's memory would be
 * unreachable once `globalSetup` itself exits. A file survives that boundary; an in-memory Map does not.
 */
export function startBackend(appDbUrl: string, port: number, logFile: string): Promise<number> {
  const fd = openSync(logFile, 'a');
  const child = spawn(process.execPath, [path.join(SERVER_DIR, 'dist', 'main.js')], {
    cwd: SERVER_DIR,
    stdio: ['ignore', fd, fd],
    env: {
      ...process.env,
      NODE_ENV: 'development', // not 'test' — ConsoleSmsProvider only prints outside test
      PORT: String(port),
      HOST: '127.0.0.1',
      DATABASE_URL: appDbUrl,
      OTP_SECRET: `e2e-otp-secret-${randomUUID().replace(/-/g, '')}`,
      PLATFORM_DOMAIN: 'localhost',
    },
  });
  child.unref();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('backend did not become ready in time'));
    }, 20_000);

    const tryHealth = (): void => {
      void fetch(`http://127.0.0.1:${String(port)}/health`)
        .then((response) => {
          if (response.ok) {
            clearTimeout(timeout);
            resolve(child.pid ?? 0);
          } else {
            setTimeout(tryHealth, 300);
          }
        })
        .catch(() => {
          setTimeout(tryHealth, 300);
        });
    };
    setTimeout(tryHealth, 500); // give the process a moment to even start listening
  });
}
