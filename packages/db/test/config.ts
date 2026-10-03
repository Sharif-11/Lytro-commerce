// Connection settings for database tests. CI overrides ADMIN_URL with its Postgres service.
// The admin role is a superuser and bypasses row-level security, so tests use it only for fixtures
// and for migrations. Assertions about isolation run as APP_ROLE, which must not bypass RLS (DAT-03).
import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required; copy packages/db/.env.example to .env`);
  }
  return value;
}

export const ADMIN_URL = requireEnv('DATABASE_TEST_ADMIN_URL');

export const TEST_DB = 'lytronix_test';
export const APP_ROLE = 'lytronix_app';
export const APP_PASSWORD = 'lytronix_app_local_only';

export function testDbUrl(adminUrl: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${TEST_DB}`;
  return url.toString();
}

export function appDbUrl(adminUrl: string): string {
  const url = new URL(testDbUrl(adminUrl));
  url.username = APP_ROLE;
  url.password = APP_PASSWORD;
  return url.toString();
}
