import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  countChallengesSince,
  createDatabase,
  createShopForVerifiedPhone,
  insertChallenge,
  latestChallenge,
  lockChallenge,
  recordWrongAttempt,
  SignupConflict,
  type DatabaseHandle,
} from '../src/index';
import { ADMIN_URL, appDbUrl, testDbUrl } from './config';
import { connect } from './helpers';

// Covers the sign-up storage behind AUTH-05 to AUTH-10 and TRL-01 (P1-E01 to P1-E04 in the test plan).
// Runs against the migrated test database; the shop is created through the application role.
let admin: pg.Client;
let handle: DatabaseHandle;

const newPhone = (): string => `0171${randomUUID().replace(/\D/g, '').slice(0, 7)}`;
const LIVE_URL = 'http://fashion-house.localhost:3000';
const body = (url: string): string => `Your shop is ready: ${url}`;

async function newChallenge(phone: string): Promise<string> {
  const row = await insertChallenge(handle.db, {
    phone,
    codeHash: 'h'.repeat(64),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });
  return row.id;
}

beforeAll(async () => {
  admin = await connect(testDbUrl(ADMIN_URL));
  handle = createDatabase(appDbUrl(ADMIN_URL));
});

afterAll(async () => {
  await handle.close();
  await admin.end();
});

describe('seeded plans (D3, TRL-01)', () => {
  it('seeds the Trial plan with the trial limits and keeps it off sale', async () => {
    const result = await admin.query<{ for_sale: boolean; limits: Record<string, number> }>(
      "SELECT for_sale, limits FROM control.plans WHERE name = 'Trial'",
    );
    expect(result.rows[0]?.for_sale).toBe(false);
    expect(result.rows[0]?.limits['essential_sms_total']).toBe(8);
    expect(result.rows[0]?.limits['products']).toBe(20);
  });
});

describe('one-time code storage (AUTH-05, AUTH-06, AUTH-07)', () => {
  it('returns the latest challenge for a number', async () => {
    const phone = newPhone();
    await newChallenge(phone);
    const second = await newChallenge(phone);
    expect((await latestChallenge(handle.db, phone))?.id).toBe(second);
  });

  it('counts challenges issued in the last hour for the hourly cap', async () => {
    const phone = newPhone();
    await newChallenge(phone);
    await newChallenge(phone);
    expect(await countChallengesSince(handle.db, phone, new Date(Date.now() - 3600_000))).toBe(2);
    expect(await countChallengesSince(handle.db, phone, new Date(Date.now() + 1000))).toBe(0);
  });

  it('counts wrong attempts atomically, so parallel guesses cannot miss the lock', async () => {
    const challengeId = await newChallenge(newPhone());
    const totals = await Promise.all([
      recordWrongAttempt(handle.db, challengeId),
      recordWrongAttempt(handle.db, challengeId),
      recordWrongAttempt(handle.db, challengeId),
    ]);
    expect([...totals].sort()).toEqual([1, 2, 3]);
  });

  it('stores a lock time on the challenge', async () => {
    const phone = newPhone();
    const challengeId = await newChallenge(phone);
    const until = new Date(Date.now() + 15 * 60 * 1000);
    await lockChallenge(handle.db, challengeId, until);
    const row = await latestChallenge(handle.db, phone);
    expect(row?.lockedUntil?.getTime()).toBe(until.getTime());
  });
});

describe('shop creation transaction (AUTH-08, AUTH-10, TEN-15)', () => {
  it('creates the subscriber, verified phone, trial shop, owner user and shop-ready message', async () => {
    const phone = newPhone();
    const challengeId = await newChallenge(phone);
    const created = await createShopForVerifiedPhone(handle.db, {
      challengeId,
      phone,
      ownerName: 'Rahim',
      shopName: 'Fashion House',
      slug: `fh-${randomUUID().slice(0, 6)}`,
      shopReadyBody: body,
      liveUrl: LIVE_URL,
      now: new Date(),
    });

    const shop = await admin.query<{ state: string; plan: string }>(
      `SELECT t.state::text AS state, p.name AS plan
       FROM control.tenants t JOIN control.plans p ON p.id = t.plan_id
       WHERE t.id = $1`,
      [created.tenantId],
    );
    expect(shop.rows[0]).toEqual({ state: 'trial', plan: 'Trial' });

    const owner = await admin.query<{ is_owner: boolean; name: string }>(
      'SELECT is_owner, name FROM tenant.users WHERE tenant_id = $1',
      [created.tenantId],
    );
    expect(owner.rows).toEqual([{ is_owner: true, name: 'Rahim' }]);

    const outbox = await admin.query<{ body: string }>(
      "SELECT body FROM control.sms_outbox WHERE to_phone = $1 AND kind = 'shop_ready'",
      [phone],
    );
    expect(outbox.rows[0]?.body).toContain(LIVE_URL);
  });

  it('refuses a phone that already holds an account, and leaves nothing behind (AUTH-08)', async () => {
    const phone = newPhone();
    const first = await newChallenge(phone);
    await createShopForVerifiedPhone(handle.db, {
      challengeId: first,
      phone,
      ownerName: 'Karim',
      shopName: 'First Shop',
      slug: `first-${randomUUID().slice(0, 6)}`,
      shopReadyBody: body,
      liveUrl: LIVE_URL,
      now: new Date(),
    });

    const second = await newChallenge(phone);
    const slug = `second-${randomUUID().slice(0, 6)}`;
    await expect(
      createShopForVerifiedPhone(handle.db, {
        challengeId: second,
        phone,
        ownerName: 'Karim',
        shopName: 'Second Shop',
        slug,
        shopReadyBody: body,
        liveUrl: LIVE_URL,
        now: new Date(),
      }),
    ).rejects.toMatchObject({ reason: 'phone_registered' });

    const leftover = await admin.query('SELECT 1 FROM control.tenants WHERE slug = $1', [slug]);
    expect(leftover.rows).toHaveLength(0);
  });

  it('refuses a taken address and rolls back the code consumption (AUTH-11, test plan risk)', async () => {
    const takenSlug = `taken-${randomUUID().slice(0, 6)}`;
    const holder = newPhone();
    await createShopForVerifiedPhone(handle.db, {
      challengeId: await newChallenge(holder),
      phone: holder,
      ownerName: 'Holder',
      shopName: 'Holder Shop',
      slug: takenSlug,
      shopReadyBody: body,
      liveUrl: LIVE_URL,
      now: new Date(),
    });

    const phone = newPhone();
    const challengeId = await newChallenge(phone);
    await expect(
      createShopForVerifiedPhone(handle.db, {
        challengeId,
        phone,
        ownerName: 'Late',
        shopName: 'Late Shop',
        slug: takenSlug,
        shopReadyBody: body,
        liveUrl: LIVE_URL,
        now: new Date(),
      }),
    ).rejects.toBeInstanceOf(SignupConflict);

    const row = await admin.query<{ consumed_at: Date | null }>(
      'SELECT consumed_at FROM control.verification_challenges WHERE id = $1',
      [challengeId],
    );
    expect(row.rows[0]?.consumed_at).toBeNull();
  });

  it('refuses a code that was already used to create a shop', async () => {
    const phone = newPhone();
    const challengeId = await newChallenge(phone);
    await createShopForVerifiedPhone(handle.db, {
      challengeId,
      phone,
      ownerName: 'Once',
      shopName: 'Once Shop',
      slug: `once-${randomUUID().slice(0, 6)}`,
      shopReadyBody: body,
      liveUrl: LIVE_URL,
      now: new Date(),
    });
    await expect(
      createShopForVerifiedPhone(handle.db, {
        challengeId,
        phone: newPhone(),
        ownerName: 'Again',
        shopName: 'Again Shop',
        slug: `again-${randomUUID().slice(0, 6)}`,
        shopReadyBody: body,
        liveUrl: LIVE_URL,
        now: new Date(),
      }),
    ).rejects.toMatchObject({ reason: 'challenge_used' });
  });
});
