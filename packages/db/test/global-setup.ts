import pg from 'pg';
import { runMigrations } from '../src/migrate';
import { ADMIN_URL, APP_PASSWORD, APP_ROLE, TEST_DB, testDbUrl } from './config';

export default async function setup(): Promise<void> {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    // The role is created before migrations so the migration's grants apply to it.
    await admin.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
          CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PASSWORD}' NOSUPERUSER NOBYPASSRLS;
        END IF;
      END $$`);
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DB}`);
  } finally {
    await admin.end();
  }
  await runMigrations(testDbUrl(ADMIN_URL));
}
