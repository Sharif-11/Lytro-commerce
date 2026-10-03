import { randomUUID } from 'node:crypto';
import pg from 'pg';

export async function connect(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}

/** Runs `work` inside a transaction with app.tenant_id set, the same way the app will (DAT-03). */
export async function inTenant<T>(
  client: pg.Client,
  tenantId: string,
  work: () => Promise<T>,
): Promise<T> {
  await client.query('BEGIN');
  try {
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await work();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export interface TenantFixture {
  tenantId: string;
  subscriberId: string;
  identityId: string;
}

/** Creates a subscriber, a verified phone identity and a tenant, as the admin role (bypasses RLS). */
export async function createTenant(admin: pg.Client, label: string): Promise<TenantFixture> {
  const subscriber = await admin.query<{ id: string }>(
    'INSERT INTO control.subscribers DEFAULT VALUES RETURNING id',
  );
  const subscriberId = subscriber.rows[0]?.id ?? '';
  const identity = await admin.query<{ id: string }>(
    `INSERT INTO control.subscriber_identities (subscriber_id, kind, value, verified_at)
     VALUES ($1, 'phone', $2, now()) RETURNING id`,
    [subscriberId, `0171${randomUUID().replace(/\D/g, '').slice(0, 7)}`],
  );
  const identityId = identity.rows[0]?.id ?? '';
  const tenant = await admin.query<{ id: string }>(
    `INSERT INTO control.tenants (owner_identity_id, subscriber_id, shop_name, slug)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [identityId, subscriberId, label, `${label.toLowerCase()}-${randomUUID().slice(0, 8)}`],
  );
  return { tenantId: tenant.rows[0]?.id ?? '', subscriberId, identityId };
}

/** Creates a staff user inside a tenant as the admin role. */
export async function createUser(
  admin: pg.Client,
  tenantId: string,
  phone: string,
): Promise<string> {
  const result = await admin.query<{ id: string }>(
    'INSERT INTO tenant.users (tenant_id, phone) VALUES ($1, $2) RETURNING id',
    [tenantId, phone],
  );
  return result.rows[0]?.id ?? '';
}
