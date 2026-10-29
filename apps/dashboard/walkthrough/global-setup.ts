import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SERVER_LOG, SERVER_PORT } from './support';

// Slice 11.13b: the walkthrough's own real server -- a fresh database (the db package's TestDatabasePreparer), then
// the built server (apps/server/dist) in development, so its SMS stub prints each code to the log the walkthrough
// reads. Both run from the log's folder, which holds no .env, so a developer's own settings never leak in.

const root = (...parts: string[]) => resolve(import.meta.dirname, '../../..', ...parts);
const DATABASE = 'lytronix_walkthrough';

async function healthy(server: ReturnType<typeof spawn>): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) break;
    try {
      const answer = await fetch(`http://localhost:${String(SERVER_PORT)}/health`);
      if (answer.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`The server did not start:\n${readFileSync(SERVER_LOG, 'utf8').slice(-3000)}`);
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  if (!process.env['DATABASE_TEST_ADMIN_URL']) {
    throw new Error(
      'The walkthrough needs DATABASE_TEST_ADMIN_URL, the test database admin address',
    );
  }
  const folder = dirname(SERVER_LOG);
  mkdirSync(folder, { recursive: true });

  const prepared = spawnSync(
    process.execPath,
    [root('packages/db/dist/prepare-database.js'), DATABASE],
    { cwd: folder, env: process.env, encoding: 'utf8' },
  );
  if (prepared.status !== 0) {
    throw new Error(`The walkthrough's database could not be prepared:\n${prepared.stderr}`);
  }
  const { appDbUrl } = JSON.parse(prepared.stdout.trim().split('\n').at(-1) ?? '{}') as {
    appDbUrl: string;
  };

  const log = createWriteStream(SERVER_LOG);
  const server = spawn(process.execPath, [root('apps/server/dist/main.js')], {
    cwd: folder,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(SERVER_PORT),
      DATABASE_URL: appDbUrl,
      OTP_SECRET: 'walkthrough-otp-secret-0123456789abcdefghijklm',
      PLATFORM_DOMAIN: 'localhost',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  await healthy(server);
  return () => {
    server.kill();
    return Promise.resolve();
  };
}
