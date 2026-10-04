import { describe, expect, it } from 'vitest';
import { SignupConflict, type CreatedShop } from '@lytronix/db';
import { ApiError } from '../src/common/api-error';
import { SlugService, type SlugAvailability } from '../src/tenancy/slug.service';
import {
  CODE_TTL_MS,
  HOURLY_CODE_CAP,
  LOCK_MS,
  MAX_WRONG_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  SignupService,
} from '../src/signup/signup.service';
import { hashCode } from '../src/signup/otp';
import type { ChallengeRecord, CreateShopRequest, SignupStore } from '../src/signup/signup.store';

// AUTH-05 to AUTH-08, AUTH-10, AUTH-11: the sign-up rules, with a fake store and a clock the test controls.
const SECRET = 's'.repeat(32);
const PHONE = '01711111111';

interface FakeState {
  challenges: (ChallengeRecord & { phone: string; attempts: number })[];
  sms: { toPhone: string; kind: string; body: string }[];
  taken: Set<string>;
  registered: Set<string>;
  shops: CreateShopRequest[];
}

function fakeStore(state: FakeState): SignupStore {
  let counter = 0;
  return {
    latestChallenge: (phone) => {
      const rows = state.challenges.filter((c) => c.phone === phone);
      return Promise.resolve(rows[rows.length - 1] ?? null);
    },
    countChallengesSince: (phone, since) =>
      Promise.resolve(
        state.challenges.filter((c) => c.phone === phone && c.createdAt > since).length,
      ),
    createChallenge: (input) => {
      counter += 1;
      const id = `c${String(counter)}`;
      state.challenges.push({
        id,
        phone: input.phone,
        attempts: 0,
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
        consumedAt: null,
        lockedUntil: null,
        createdAt: now.value,
      });
      return Promise.resolve(id);
    },
    recordWrongAttempt: (challengeId) => {
      const row = state.challenges.find((c) => c.id === challengeId);
      if (!row) throw new Error('no challenge');
      row.attempts += 1;
      return Promise.resolve(row.attempts);
    },
    lockChallenge: (challengeId, until) => {
      const row = state.challenges.find((c) => c.id === challengeId);
      if (row) row.lockedUntil = until;
      return Promise.resolve();
    },
    sendSms: (message) => {
      state.sms.push(message);
      return Promise.resolve();
    },
    createShop: (request): Promise<CreatedShop> => {
      if (state.registered.has(request.phone)) {
        return Promise.reject(new SignupConflict('phone_registered'));
      }
      if (state.taken.has(request.slug)) {
        return Promise.reject(new SignupConflict('address_taken'));
      }
      const row = state.challenges.find((c) => c.id === request.challengeId);
      if (row?.consumedAt) return Promise.reject(new SignupConflict('challenge_used'));
      if (row) row.consumedAt = request.now;
      state.shops.push(request);
      state.taken.add(request.slug);
      return Promise.resolve({ tenantId: `t${String(state.shops.length)}`, subscriberId: 's' });
    },
  };
}

const now = { value: new Date('2026-10-04T10:00:00Z') };

function availability(unavailable: string[]): SlugAvailability {
  const set = new Set(unavailable);
  return {
    findUnavailable: (slugs) => Promise.resolve(new Set(slugs.filter((s) => set.has(s)))),
  };
}

function setup(options: { taken?: string[]; registered?: string[] } = {}) {
  const state: FakeState = {
    challenges: [],
    sms: [],
    taken: new Set(options.taken ?? []),
    registered: new Set(options.registered ?? []),
    shops: [],
  };
  const service = new SignupService(
    fakeStore(state),
    () => now.value,
    SECRET,
    (address) => `http://${address}.localhost:3000`,
    new SlugService(availability(options.taken ?? [])),
  );
  return { state, service };
}

/** The code that was texted last, read back from the stub, as the owner would type it. */
function lastCode(state: FakeState): string {
  const body = state.sms[state.sms.length - 1]?.body ?? '';
  return /(\d{6})/.exec(body)?.[1] ?? '';
}

function expectApiError(promise: Promise<unknown>, code: string) {
  return expect(promise).rejects.toMatchObject({ code });
}

describe('requesting a code (AUTH-05, AUTH-07)', () => {
  it('refuses a number that is not a Bangladeshi mobile', async () => {
    const { service } = setup();
    await expect(service.requestCode('+14155550100')).rejects.toBeInstanceOf(ApiError);
    await expectApiError(service.requestCode('+14155550100'), 'validation_error');
  });

  it('sends a six-digit code, and stores only a keyed hash of it', async () => {
    const { state, service } = setup();
    const issued = await service.requestCode(PHONE);
    expect(issued).toEqual({ expiresInSeconds: 300, resendAfterSeconds: 60 });

    const code = lastCode(state);
    expect(code).toMatch(/^\d{6}$/);
    expect(state.challenges[0]?.codeHash).toBe(hashCode(code, PHONE, SECRET));
    expect(state.challenges[0]?.codeHash).not.toContain(code);
  });

  it('refuses a second request within 60 seconds, with a retry hint', async () => {
    const { state, service } = setup();
    await service.requestCode(PHONE);
    now.value = new Date(now.value.getTime() + 30_000);
    const attempt = service.requestCode(PHONE);
    await expect(attempt).rejects.toMatchObject({ code: 'rate_limited', retryAfterSeconds: 30 });
    expect(state.sms).toHaveLength(1);
    now.value = new Date(now.value.getTime() + 30_000);
  });

  it('allows a request after the cooldown', async () => {
    const { state, service } = setup();
    await service.requestCode(PHONE);
    now.value = new Date(now.value.getTime() + RESEND_COOLDOWN_MS);
    await service.requestCode(PHONE);
    expect(state.sms).toHaveLength(2);
  });

  it('refuses the sixth code in an hour, with a retry hint of one hour', async () => {
    const { state, service } = setup();
    for (let i = 0; i < HOURLY_CODE_CAP; i += 1) {
      await service.requestCode(PHONE);
      now.value = new Date(now.value.getTime() + RESEND_COOLDOWN_MS);
    }
    await expect(service.requestCode(PHONE)).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 3600,
    });
    expect(state.sms).toHaveLength(HOURLY_CODE_CAP);
    now.value = new Date(now.value.getTime() + 3600_000);
  });
});

describe('creating the shop (AUTH-04, AUTH-05, AUTH-06, AUTH-10, AUTH-11)', () => {
  it('creates the shop with the suggested address from the Latin letters of the name', async () => {
    const { state, service } = setup();
    await service.requestCode(PHONE);
    const shop = await service.createShop({
      phone: PHONE,
      code: lastCode(state),
      ownerName: 'Rahim',
      shopName: 'Fashion House',
    });
    expect(shop).toEqual({
      tenantId: 't1',
      address: 'fashion-house',
      shopUrl: 'http://fashion-house.localhost:3000',
    });
  });

  it('uses the address the owner typed, when it is free', async () => {
    const { state, service } = setup();
    await service.requestCode(PHONE);
    const shop = await service.createShop({
      phone: PHONE,
      code: lastCode(state),
      ownerName: 'Rahim',
      shopName: 'ফ্যাশন হাউস',
      address: 'my-shop',
    });
    expect(shop.address).toBe('my-shop');
  });

  it('gives a suggestion, not a shop, when the typed address is taken', async () => {
    const { state, service } = setup({ taken: ['fashion-house'] });
    await service.requestCode(PHONE);
    await expect(
      service.createShop({
        phone: PHONE,
        code: lastCode(state),
        ownerName: 'Rahim',
        shopName: 'Fashion House',
        address: 'fashion-house',
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: { field: 'address', suggestion: 'fashion-house-2' },
    });
    expect(state.shops).toHaveLength(0);
  });

  it('asks for an address when the name has no Latin letters', async () => {
    const { state, service } = setup();
    await service.requestCode(PHONE);
    await expect(
      service.createShop({
        phone: PHONE,
        code: lastCode(state),
        ownerName: 'Rahim',
        shopName: 'ফ্যাশন হাউস',
      }),
    ).rejects.toMatchObject({ code: 'validation_error', details: { field: 'address' } });
  });

  it('answers a registered phone with a vague message, not a reveal (AUTH-08)', async () => {
    const { state, service } = setup({ registered: [PHONE] });
    await service.requestCode(PHONE);
    await expect(
      service.createShop({
        phone: PHONE,
        code: lastCode(state),
        ownerName: 'Rahim',
        shopName: 'Fashion House',
      }),
    ).rejects.toMatchObject({ code: 'conflict', message: 'Sign in to continue.' });
  });

  it('refuses a code that was already used, and a code that has expired', async () => {
    const { state, service } = setup();
    await service.requestCode(PHONE);
    const code = lastCode(state);
    await service.createShop({ phone: PHONE, code, ownerName: 'A', shopName: 'Shop One' });
    await expectApiError(
      service.createShop({ phone: PHONE, code, ownerName: 'A', shopName: 'Shop Two' }),
      'validation_error',
    );

    const other = setup();
    await other.service.requestCode('01811111111');
    const late = lastCode(other.state);
    now.value = new Date(now.value.getTime() + CODE_TTL_MS + 1000);
    await expectApiError(
      other.service.createShop({
        phone: '01811111111',
        code: late,
        ownerName: 'A',
        shopName: 'Late',
      }),
      'validation_error',
    );
    now.value = new Date(now.value.getTime() - CODE_TTL_MS - 1000);
  });
});

describe('wrong codes and the lock (AUTH-06)', () => {
  it('reports attempts left for the first wrong codes', async () => {
    const { service } = setup();
    await service.requestCode(PHONE);
    await expect(
      service.createShop({ phone: PHONE, code: '000000', ownerName: 'A', shopName: 'Shop' }),
    ).rejects.toMatchObject({ code: 'validation_error', details: { attemptsLeft: 4 } });
  });

  it('locks the code after five wrong codes, even when the sixth is correct', async () => {
    const { state, service } = setup();
    await service.requestCode(PHONE);
    const correct = lastCode(state);
    for (let i = 0; i < MAX_WRONG_ATTEMPTS - 1; i += 1) {
      await expect(
        service.createShop({
          phone: PHONE,
          code: wrongCode(correct),
          ownerName: 'A',
          shopName: 'S',
        }),
      ).rejects.toMatchObject({ code: 'validation_error' });
    }
    await expect(
      service.createShop({ phone: PHONE, code: wrongCode(correct), ownerName: 'A', shopName: 'S' }),
    ).rejects.toMatchObject({ code: 'rate_limited' });
    await expect(
      service.createShop({ phone: PHONE, code: correct, ownerName: 'A', shopName: 'Shop' }),
    ).rejects.toMatchObject({ code: 'rate_limited', retryAfterSeconds: LOCK_MS / 1000 });
    expect(state.shops).toHaveLength(0);
  });

  it('accepts the correct code once the lock has ended', async () => {
    const { state, service } = setup();
    await service.requestCode(PHONE);
    const correct = lastCode(state);
    for (let i = 0; i < MAX_WRONG_ATTEMPTS; i += 1) {
      await service
        .createShop({
          phone: PHONE,
          code: wrongCode(correct),
          ownerName: 'A',
          shopName: 'S',
        })
        .catch(() => undefined);
    }
    await expect(service.requestCode(PHONE)).rejects.toMatchObject({ code: 'rate_limited' });

    now.value = new Date(now.value.getTime() + LOCK_MS + 1000);
    await service.requestCode(PHONE);
    await service.createShop({
      phone: PHONE,
      code: lastCode(state),
      ownerName: 'A',
      shopName: 'Shop',
    });
    expect(state.shops).toHaveLength(1);
  });
});

/** A six-digit code that is certainly not the correct one. */
function wrongCode(correct: string): string {
  return correct === '000000' ? '111111' : '000000';
}
