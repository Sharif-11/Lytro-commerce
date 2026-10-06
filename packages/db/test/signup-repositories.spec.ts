import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { ChallengeChannel, ChallengeKind, IdentityKind } from '@lytronix/validators';
import {
  AccountRepository,
  ChallengeRepository,
  DatabaseConnector,
  type DatabaseHandle,
  TenantRepository,
  TransactionRunner,
  UserRepository,
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
  const row = await new ChallengeRepository().insert(handle.db, {
    destination: phone,
    channel: ChallengeChannel.Sms,
    kind: ChallengeKind.Signin,
    codeHash: 'h'.repeat(64),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });
  return row.id;
}

beforeAll(async () => {
  admin = await connect(testDbUrl(ADMIN_URL));
  handle = new DatabaseConnector().connect(appDbUrl(ADMIN_URL));
});

afterAll(async () => {
  await handle.close();
  await admin.end();
});

describe('seeded plans (D3, TRL-01)', () => {
  it('finds the Trial plan, which is off sale, with the trial limits', async () => {
    const trial = await new TenantRepository().findPlanByName(handle.db, 'Trial', false);
    expect(trial?.limits).toMatchObject({ essential_sms_total: 8, products: 20 });
  });
});

describe('one-time code rows (AUTH-05, AUTH-06, AUTH-07)', () => {
  it('returns the latest challenge and counts recent ones', async () => {
    const phone = newPhone();
    await newChallenge(phone);
    const second = await newChallenge(phone);
    expect(
      (
        await new ChallengeRepository().latest(
          handle.db,
          phone,
          ChallengeChannel.Sms,
          ChallengeKind.Signin,
        )
      )?.id,
    ).toBe(second);
    expect(
      await new ChallengeRepository().countSince(
        handle.db,
        phone,
        ChallengeChannel.Sms,
        ChallengeKind.Signin,
        new Date(Date.now() - 3600_000),
      ),
    ).toBe(2);
  });

  it('counts wrong attempts atomically', async () => {
    const challengeId = await newChallenge(newPhone());
    const totals = await Promise.all([
      new ChallengeRepository().recordWrongAttempt(handle.db, challengeId),
      new ChallengeRepository().recordWrongAttempt(handle.db, challengeId),
      new ChallengeRepository().recordWrongAttempt(handle.db, challengeId),
    ]);
    expect([...totals].sort()).toEqual([1, 2, 3]);
  });

  it('stores a lock time on the challenge', async () => {
    const phone = newPhone();
    const challengeId = await newChallenge(phone);
    const until = new Date(Date.now() + 15 * 60 * 1000);
    await new ChallengeRepository().lock(handle.db, challengeId, until);
    expect(
      (
        await new ChallengeRepository().latest(
          handle.db,
          phone,
          ChallengeChannel.Sms,
          ChallengeKind.Signin,
        )
      )?.lockedUntil?.getTime(),
    ).toBe(until.getTime());
  });

  it('consumes a challenge once; the second consumption finds it already used', async () => {
    const challengeId = await newChallenge(newPhone());
    const now = new Date();
    expect(
      await new TransactionRunner().run(handle.db, (tx) =>
        new ChallengeRepository().consume(tx, challengeId, now),
      ),
    ).toBe(true);
    expect(
      await new TransactionRunner().run(handle.db, (tx) =>
        new ChallengeRepository().consume(tx, challengeId, now),
      ),
    ).toBe(false);
  });
});

describe('unique constraints surface as recognisable errors (AUTH-08, AUTH-11)', () => {
  it('reports a duplicate phone identity', async () => {
    const phone = newPhone();
    const subscriberId = await new AccountRepository().insertSubscriber(handle.db);
    await new AccountRepository().insertIdentity(handle.db, {
      subscriberId,
      value: phone,
      kind: IdentityKind.Phone,
      verifiedAt: new Date(),
    });
    const again = await new AccountRepository().insertSubscriber(handle.db);
    const failure = await new AccountRepository()
      .insertIdentity(handle.db, {
        subscriberId: again,
        value: phone,
        kind: IdentityKind.Phone,
        verifiedAt: new Date(),
      })
      .catch((error: unknown) => error);
    expect(new TransactionRunner().isUniqueViolation(failure, 'kind_value')).toBe(true);
  });

  it('reports a duplicate tenant address', async () => {
    const slug = newSlug();
    const plan = await new TenantRepository().findPlanByName(handle.db, 'Trial', false);
    const subscriberId = await new AccountRepository().insertSubscriber(handle.db);
    const identity = await new AccountRepository().insertIdentity(handle.db, {
      subscriberId,
      kind: IdentityKind.Phone,
      value: newPhone(),
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
    await new TenantRepository().insert(handle.db, values);

    const otherSubscriber = await new AccountRepository().insertSubscriber(handle.db);
    const otherIdentity = await new AccountRepository().insertIdentity(handle.db, {
      subscriberId: otherSubscriber,
      kind: IdentityKind.Phone,
      value: newPhone(),
      verifiedAt: new Date(),
    });
    const failure = await new TenantRepository()
      .insert(handle.db, {
        ...values,
        ownerIdentityId: otherIdentity,
        subscriberId: otherSubscriber,
      })
      .catch((error: unknown) => error);
    expect(new TransactionRunner().isUniqueViolation(failure, 'tenants_slug')).toBe(true);
  });
});

describe('one unit of work (AUTH-10)', () => {
  it('rolls back every step when a later one fails, including the code consumption', async () => {
    const phone = newPhone();
    const challengeId = await newChallenge(phone);
    const before = await admin.query('SELECT count(*)::int AS n FROM control.subscribers');

    await expect(
      new TransactionRunner().run(handle.db, async (tx) => {
        expect(await new ChallengeRepository().consume(tx, challengeId, new Date())).toBe(true);
        await new AccountRepository().insertSubscriber(tx);
        throw new Error('a later step failed');
      }),
    ).rejects.toThrow('a later step failed');

    const after = await admin.query('SELECT count(*)::int AS n FROM control.subscribers');
    expect(after.rows[0]).toEqual(before.rows[0]);
    expect(
      await new TransactionRunner().run(handle.db, (tx) =>
        new ChallengeRepository().consume(tx, challengeId, new Date()),
      ),
    ).toBe(true);
  });

  it('writes the owner user inside the tenant context, visible only to that tenant (DAT-03)', async () => {
    const plan = await new TenantRepository().findPlanByName(handle.db, 'Trial', false);
    const phone = newPhone();
    const subscriberId = await new AccountRepository().insertSubscriber(handle.db);
    const identity = await new AccountRepository().insertIdentity(handle.db, {
      subscriberId,
      value: phone,
      kind: IdentityKind.Phone,
      verifiedAt: new Date(),
    });
    const tenantId = await new TransactionRunner().run(handle.db, async (tx) => {
      const id = await new TenantRepository().insert(tx, {
        ownerIdentityId: identity,
        subscriberId,
        shopName: 'Owner Shop',
        slug: newSlug(),
        planId: plan?.id ?? '',
        planSnapshot: plan?.limits ?? {},
        periodStart: new Date(),
        periodEnd: new Date(),
      });
      await new UserRepository(new TransactionRunner()).insertOwner(tx, {
        tenantId: id,
        phone,
        name: 'Owner',
      });
      return id;
    });

    const seen = await admin.query<{ is_owner: boolean }>(
      'SELECT is_owner FROM tenant.users WHERE tenant_id = $1',
      [tenantId],
    );
    expect(seen.rows).toEqual([{ is_owner: true }]);
  });
});
