import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { TestDatabasePreparer, type PreparedDatabase } from '@lytronix/db';

// Shared setup for server tests that need a migrated database. Each suite names its own database,
// so suites running in parallel under Turbo never drop each other's data.

/**
 * Creates the application role if missing, recreates the database, and applies every migration (the db package's
 * TestDatabasePreparer, which the dashboard's walkthrough uses too). Returns the admin URL for fixtures (bypasses
 * row-level security) and the application URL (does not).
 */
export function prepareTestDatabase(adminUrl: string, database: string): Promise<PreparedDatabase> {
  return new TestDatabasePreparer().prepare(adminUrl, database);
}

/**
 * Gives a shop a balance the only way the database allows (BAL-02): one balance-ledger entry, whose insert moves
 * balance_amount. An adjustment, since a seeded balance may be any sign; zero writes nothing.
 */
export async function seedBalance(
  admin: pg.Client,
  tenantId: string,
  amount: string,
): Promise<void> {
  if (Number(amount) === 0) return;
  await admin.query(
    `INSERT INTO tenant.balance_ledger (tenant_id, type, amount, reference)
     VALUES ($1, 'adjustment', $2, '{"seeded": "test"}')`,
    [tenantId, amount],
  );
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
