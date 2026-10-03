import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { ADMIN_URL, testDbUrl } from './config';
import { connect, createTenant, type TenantFixture } from './helpers';

// AUTH-11: the database is the final check on a slug. Two sign-ups racing for one address cannot
// both succeed, because the second insert fails with a unique violation (SQLSTATE 23505).
let admin: pg.Client;
let existing: TenantFixture;

beforeAll(async () => {
  admin = await connect(testDbUrl(ADMIN_URL));
  existing = await createTenant(admin, 'Racer');
});

afterAll(async () => {
  await admin.end();
});

describe('slug uniqueness at the database (AUTH-11)', () => {
  it('refuses a second shop with a slug that is already held', async () => {
    const held = await admin.query<{ slug: string }>(
      'SELECT slug FROM control.tenants WHERE id = $1',
      [existing.tenantId],
    );
    const subscriber = await admin.query<{ id: string }>(
      'INSERT INTO control.subscribers DEFAULT VALUES RETURNING id',
    );
    const subscriberId = subscriber.rows[0]?.id ?? '';
    const identity = await admin.query<{ id: string }>(
      `INSERT INTO control.subscriber_identities (subscriber_id, kind, value, verified_at)
       VALUES ($1, 'phone', $2, now()) RETURNING id`,
      [subscriberId, `0199${randomUUID().replace(/\D/g, '').slice(0, 7)}`],
    );

    await expect(
      admin.query(
        `INSERT INTO control.tenants (owner_identity_id, subscriber_id, shop_name, slug)
         VALUES ($1, $2, 'Duplicate', $3)`,
        [identity.rows[0]?.id, subscriberId, held.rows[0]?.slug],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });
});
