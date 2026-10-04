import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { MigrationRunner } from '@lytronix/db';

// Shared setup for server tests that need a migrated database. Each suite names its own database,
// so suites running in parallel under Turbo never drop each other's data.
export const APP_ROLE = 'lytronix_app';
export const APP_PASSWORD = 'lytronix_app_local_only';

export function withDatabase(
  url: string,
  database: string,
  user?: string,
  password?: string,
): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  if (user) parsed.username = user;
  if (password) parsed.password = password;
  return parsed.toString();
}

/**
 * Creates the application role if missing, recreates the database, and applies every migration.
 * Returns the admin URL for fixtures (bypasses row-level security) and the application URL (does not).
 */
export async function prepareTestDatabase(
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
  return {
    adminDbUrl,
    appDbUrl: withDatabase(adminUrl, database, APP_ROLE, APP_PASSWORD),
  };
}

/** Creates a subscriber, a verified phone identity and a shop, as the admin role. Returns the shop id. */
export async function seedShop(
  admin: pg.Client,
  shopName: string,
  slug: string,
  state = 'active',
): Promise<string> {
  const subscriber = await admin.query<{ id: string }>(
    'INSERT INTO control.subscribers DEFAULT VALUES RETURNING id',
  );
  const subscriberId = subscriber.rows[0]?.id ?? '';
  const identity = await admin.query<{ id: string }>(
    `INSERT INTO control.subscriber_identities (subscriber_id, kind, value, verified_at)
     VALUES ($1, 'phone', $2, now()) RETURNING id`,
    [subscriberId, `0171${randomUUID().replace(/\D/g, '').slice(0, 7)}`],
  );
  const tenant = await admin.query<{ id: string }>(
    `INSERT INTO control.tenants (owner_identity_id, subscriber_id, shop_name, slug, state)
     VALUES ($1, $2, $3, $4, $5::control.tenant_state) RETURNING id`,
    [identity.rows[0]?.id, subscriberId, shopName, slug, state],
  );
  return tenant.rows[0]?.id ?? '';
}
