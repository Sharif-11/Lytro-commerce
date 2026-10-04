import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  consumeChallenge,
  createDatabase,
  findPlanByName,
  insertChallenge,
  insertOwnerUser,
  insertPhoneIdentity,
  insertSubscriber,
  insertTenant,
  isUniqueViolation,
  latestChallenge,
  lockChallenge,
  recordWrongAttempt,
  runInTransaction,
  countChallengesSince,
  type DatabaseHandle,
} from '../src/index';
import { ADMIN_URL, appDbUrl, testDbUrl } from './config';
import { connect } from './helpers';

// Repository and transaction behaviour behind sign-up (AUTH-05 to AUTH-10, TRL-01). Each repository is
// tested on its own; the composition is tested through the transaction it runs in.
let admin: pg.Client;
let handle: DatabaseHandle;

const newPhone = (): string => `0171${randomUUID().replace(/\D/g, '').slice(0, 7)}`;
const newSlug = (): string => `s-${randomUUID().slice(0, 8)}`;

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
  it('finds the Trial plan, which is off sale, with the trial limits', async () => {
    const trial = await findPlanByName(handle.db, 'Trial', false);
    expect(trial?.limits).toMatchObject({ essential_sms_total: 8, products: 20 });
  });
});

describe('one-time code rows (AUTH-05, AUTH-06, AUTH-07)', () => {
  it('returns the latest challenge and counts recent ones', async () => {
    const phone = newPhone();
    await newChallenge(phone);
    const second = await newChallenge(phone);
    expect((await latestChallenge(handle.db, phone))?.id).toBe(second);
    expect(await countChallengesSince(handle.db, phone, new Date(Date.now() - 3600_000))).toBe(2);
  });

  it('counts wrong attempts atomically', async () => {
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
    expect((await latestChallenge(handle.db, phone))?.lockedUntil?.getTime()).toBe(until.getTime());
  });

  it('consumes a challenge once; the second consumption finds it already used', async () => {
    const challengeId = await newChallenge(newPhone());
    const now = new Date();
    expect(await runInTransaction(handle.db, (tx) => consumeChallenge(tx, challengeId, now))).toBe(
      true,
    );
    expect(await runInTransaction(handle.db, (tx) => consumeChallenge(tx, challengeId, now))).toBe(
      false,
    );
  });
});

describe('unique constraints surface as recognisable errors (AUTH-08, AUTH-11)', () => {
  it('reports a duplicate phone identity', async () => {
    const phone = newPhone();
    const subscriberId = await insertSubscriber(handle.db);
    await insertPhoneIdentity(handle.db, { subscriberId, phone, verifiedAt: new Date() });
    const again = await insertSubscriber(handle.db);
    const failure = await insertPhoneIdentity(handle.db, {
      subscriberId: again,
      phone,
      verifiedAt: new Date(),
    }).catch((error: unknown) => error);
    expect(isUniqueViolation(failure, 'kind_value')).toBe(true);
  });

  it('reports a duplicate tenant address', async () => {
    const slug = newSlug();
    const plan = await findPlanByName(handle.db, 'Trial', false);
    const subscriberId = await insertSubscriber(handle.db);
    const identity = await insertPhoneIdentity(handle.db, {
      subscriberId,
      phone: newPhone(),
      verifiedAt: new Date(),
    });
    const values = {
      ownerIdentityId: identity,
      subscriberId,
      shopName: 'Shop',
      slug,
      planId: plan?.id ?? '',
      planSnapshot: plan?.limits ?? {},
      periodStart: new Date(),
      periodEnd: new Date(),
    };
    await insertTenant(handle.db, values);

    const otherSubscriber = await insertSubscriber(handle.db);
    const otherIdentity = await insertPhoneIdentity(handle.db, {
      subscriberId: otherSubscriber,
      phone: newPhone(),
      verifiedAt: new Date(),
    });
    const failure = await insertTenant(handle.db, {
      ...values,
      ownerIdentityId: otherIdentity,
      subscriberId: otherSubscriber,
    }).catch((error: unknown) => error);
    expect(isUniqueViolation(failure, 'tenants_slug')).toBe(true);
  });
});

describe('one unit of work (AUTH-10)', () => {
  it('rolls back every step when a later one fails, including the code consumption', async () => {
    const phone = newPhone();
    const challengeId = await newChallenge(phone);
    const before = await admin.query('SELECT count(*)::int AS n FROM control.subscribers');

    await expect(
      runInTransaction(handle.db, async (tx) => {
        expect(await consumeChallenge(tx, challengeId, new Date())).toBe(true);
        await insertSubscriber(tx);
        throw new Error('a later step failed');
      }),
    ).rejects.toThrow('a later step failed');

    const after = await admin.query('SELECT count(*)::int AS n FROM control.subscribers');
    expect(after.rows[0]).toEqual(before.rows[0]);
    expect(
      await runInTransaction(handle.db, (tx) => consumeChallenge(tx, challengeId, new Date())),
    ).toBe(true);
  });

  it('writes the owner user inside the tenant context, visible only to that tenant (DAT-03)', async () => {
    const plan = await findPlanByName(handle.db, 'Trial', false);
    const phone = newPhone();
    const subscriberId = await insertSubscriber(handle.db);
    const identity = await insertPhoneIdentity(handle.db, {
      subscriberId,
      phone,
      verifiedAt: new Date(),
    });
    const tenantId = await runInTransaction(handle.db, async (tx) => {
      const id = await insertTenant(tx, {
        ownerIdentityId: identity,
        subscriberId,
        shopName: 'Owner Shop',
        slug: newSlug(),
        planId: plan?.id ?? '',
        planSnapshot: plan?.limits ?? {},
        periodStart: new Date(),
        periodEnd: new Date(),
      });
      await insertOwnerUser(tx, { tenantId: id, phone, name: 'Owner' });
      return id;
    });

    const seen = await admin.query<{ is_owner: boolean }>(
      'SELECT is_owner FROM tenant.users WHERE tenant_id = $1',
      [tenantId],
    );
    expect(seen.rows).toEqual([{ is_owner: true }]);
  });
});
