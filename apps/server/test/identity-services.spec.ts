import { describe, expect, it } from 'vitest';
import type { Transaction } from '@lytronix/db';
import { ApiError } from '../src/common/api-error';
import { UniqueViolation } from '../src/common/errors/unique-violation';
import {
  CODE_TTL_MS,
  HOURLY_CODE_CAP,
  LOCK_MS,
  MAX_WRONG_ATTEMPTS,
  OneTimeCodeService,
  RESEND_COOLDOWN_MS,
} from '../src/identity/services/one-time-code.service';
import { PhoneSignupService } from '../src/identity/services/phone-signup.service';
import type {
  ChallengeRecord,
  ChallengeStore,
  SignupGateway,
  SignupSettings,
} from '../src/identity/services/ports';
import { hashCode } from '../src/identity/services/one-time-code';
import {
  MessagingService,
  type MessageStore,
  type SmsProvider,
} from '../src/messaging/services/messaging.service';
import { StaffService, type StaffStore } from '../src/staff/services/staff.service';
import { SlugService, type SlugAvailability } from '../src/tenancy/services/slug.service';
import { TenantService, type TenantStore } from '../src/tenancy/services/tenant.service';

// AUTH-05 to AUTH-08, AUTH-10, AUTH-11 and TRL-01, tested through the real services with fake ports.
const SECRET = 's'.repeat(32);
const PHONE = '01711111111';
const TX = {} as Transaction;

interface StoredMessage {
  id: number;
  toPhone: string;
  kind: string;
  body: string | null;
  status: string;
  attempts: number;
  nextAt: Date;
}

interface World {
  now: Date;
  challenges: (ChallengeRecord & { phone: string })[];
  outbox: StoredMessage[];
  sent: { toPhone: string; body: string }[];
  smsFails: boolean;
  registered: Set<string>;
  takenAddresses: Set<string>;
  owners: { tenantId: string; phone: string; name: string }[];
  shops: { slug: string; tenantId: string }[];
  counter: number;
}

function world(options: { registered?: string[]; taken?: string[] } = {}): World {
  return {
    now: new Date('2026-10-04T10:00:00Z'),
    challenges: [],
    outbox: [],
    sent: [],
    smsFails: false,
    registered: new Set(options.registered ?? []),
    takenAddresses: new Set(options.taken ?? []),
    owners: [],
    shops: [],
    counter: 0,
  };
}

function build(state: World) {
  const challenges: ChallengeStore = {
    latest: (_tx, phone) => {
      const rows = state.challenges.filter((c) => c.phone === phone);
      return Promise.resolve(rows[rows.length - 1] ?? null);
    },
    countSince: (_tx, phone, since) =>
      Promise.resolve(
        state.challenges.filter((c) => c.phone === phone && c.createdAt > since).length,
      ),
    create: (_tx, input) => {
      state.counter += 1;
      const id = `c${String(state.counter)}`;
      state.challenges.push({
        id,
        phone: input.phone,
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
        consumedAt: null,
        lockedUntil: null,
        attempts: 0,
        createdAt: state.now,
      });
      return Promise.resolve({ id, createdAt: state.now });
    },
    recordWrongAttempt: (_tx, id) => {
      const row = state.challenges.find((c) => c.id === id);
      if (!row) throw new Error('no challenge');
      row.attempts += 1;
      return Promise.resolve(row.attempts);
    },
    lock: (_tx, id, until) => {
      const row = state.challenges.find((c) => c.id === id);
      if (row) row.lockedUntil = until;
      return Promise.resolve();
    },
  };

  const gateway: SignupGateway = {
    run: (work) => work(TX),
    consumeChallenge: (_tx, id) => {
      const row = state.challenges.find((c) => c.id === id);
      if (!row || row.consumedAt) return Promise.resolve(false);
      row.consumedAt = state.now;
      return Promise.resolve(true);
    },
    insertSubscriber: () => {
      state.counter += 1;
      return Promise.resolve(`sub-${String(state.counter)}`);
    },
    insertPhoneIdentity: (_tx, values) => {
      if (state.registered.has(values.phone)) {
        return Promise.reject(new UniqueViolation('phone'));
      }
      return Promise.resolve(`id-${values.phone}`);
    },
  };

  const messageStore: MessageStore = {
    insert: (_executor, message) => {
      state.counter += 1;
      state.outbox.push({
        id: state.counter,
        toPhone: message.toPhone,
        kind: message.kind,
        body: message.body,
        status: 'pending',
        attempts: 0,
        nextAt: state.now,
      });
      return Promise.resolve(state.counter);
    },
    claimDue: (input) => {
      const due = state.outbox
        .filter(
          (m) =>
            m.status === 'pending' &&
            m.body !== null &&
            m.nextAt <= input.now &&
            (input.onlyId === undefined || m.id === input.onlyId),
        )
        .slice(0, input.limit);
      for (const row of due) row.status = 'sending';
      return Promise.resolve(
        due.map((m) => ({
          id: m.id,
          toPhone: m.toPhone,
          body: m.body ?? '',
          attempts: m.attempts,
        })),
      );
    },
    markSent: (id) => {
      const row = state.outbox.find((m) => m.id === id);
      if (row) row.status = 'sent';
      return Promise.resolve();
    },
    markFailed: (id, input) => {
      const row = state.outbox.find((m) => m.id === id);
      if (!row) return Promise.resolve();
      row.attempts = input.attempts;
      row.status = input.nextAttemptAt ? 'pending' : 'failed';
      row.nextAt = input.nextAttemptAt ?? state.now;
      return Promise.resolve();
    },
  };
  const provider: SmsProvider = {
    send: (message) => {
      if (state.smsFails) return Promise.reject(new Error('provider down'));
      state.sent.push(message);
      return Promise.resolve();
    },
  };
  const messaging = new MessagingService(messageStore, provider, () => state.now);

  const staffStore: StaffStore = {
    insertOwner: (_tx, values) => {
      state.owners.push(values);
      return Promise.resolve();
    },
  };

  const tenantStore: TenantStore = {
    findTrialPlan: () => Promise.resolve({ id: 'plan-trial', limits: { essential_sms_total: 8 } }),
    insertTenant: (_tx, values) => {
      if (state.takenAddresses.has(values.slug)) {
        return Promise.reject(new UniqueViolation('address'));
      }
      const tenantId = `t-${values.slug}`;
      state.takenAddresses.add(values.slug);
      state.shops.push({ slug: values.slug, tenantId });
      return Promise.resolve(tenantId);
    },
  };
  const tenants = new TenantService(
    tenantStore,
    () => state.now,
    new StaffService(staffStore),
    messaging,
  );

  const availability: SlugAvailability = {
    findUnavailable: (slugs) =>
      Promise.resolve(new Set(slugs.filter((s) => state.takenAddresses.has(s)))),
  };
  const slugs = new SlugService(availability);

  const settings: SignupSettings = {
    now: () => state.now,
    otpSecret: SECRET,
    shopUrl: (address) => `http://${address}.localhost:3000`,
  };

  const codes = new OneTimeCodeService(challenges, gateway, settings, messaging);
  const signup = new PhoneSignupService(codes, gateway, tenants, slugs, messaging, settings);
  return { codes, signup, messaging };
}

/** The code most recently texted, read back from the outbox as the owner would see it. */
function lastCode(state: World): string {
  // The text the owner received: the provider log, since the outbox never stores a code.
  const body = state.sent[state.sent.length - 1]?.body ?? '';
  return /(\d{6})/.exec(body)?.[1] ?? '';
}

function advance(state: World, ms: number): void {
  state.now = new Date(state.now.getTime() + ms);
}

function wrongCode(correct: string): string {
  return correct === '000000' ? '111111' : '000000';
}

describe('requesting a code (AUTH-05, AUTH-07)', () => {
  it('refuses a number that is not Bangladeshi, naming the field', async () => {
    const { signup } = build(world());
    await expect(signup.requestCode('+14155550100')).rejects.toMatchObject({
      code: 'validation_error',
      details: { field: 'phone' },
    });
  });

  it('sends a six-digit code and stores only a keyed hash of it', async () => {
    const state = world();
    const { signup } = build(state);
    expect(await signup.requestCode(PHONE)).toEqual({
      expiresInSeconds: CODE_TTL_MS / 1000,
      resendAfterSeconds: RESEND_COOLDOWN_MS / 1000,
    });
    const code = lastCode(state);
    expect(code).toMatch(/^\d{6}$/);
    expect(state.challenges[0]?.codeHash).toBe(hashCode(code, PHONE, SECRET));
    expect(state.sent).toHaveLength(1);
  });

  it('refuses a resend within 60 seconds, with a retry hint', async () => {
    const state = world();
    const { signup } = build(state);
    await signup.requestCode(PHONE);
    advance(state, 30_000);
    await expect(signup.requestCode(PHONE)).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 30,
    });
    expect(state.sent).toHaveLength(1);
  });

  it('allows a request after the cooldown', async () => {
    const state = world();
    const { signup } = build(state);
    await signup.requestCode(PHONE);
    advance(state, RESEND_COOLDOWN_MS);
    await signup.requestCode(PHONE);
    expect(state.sent).toHaveLength(2);
  });

  it('refuses the sixth code in an hour', async () => {
    const state = world();
    const { signup } = build(state);
    for (let i = 0; i < HOURLY_CODE_CAP; i += 1) {
      await signup.requestCode(PHONE);
      advance(state, RESEND_COOLDOWN_MS);
    }
    await expect(signup.requestCode(PHONE)).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 3600,
    });
  });
});

describe('creating the shop (AUTH-04, AUTH-05, AUTH-08, AUTH-10, AUTH-11)', () => {
  it('creates the shop, its owner and the ready message, and suggests the address from the name', async () => {
    const state = world();
    const { signup } = build(state);
    await signup.requestCode(PHONE);
    const shop = await signup.createShop({
      phone: PHONE,
      code: lastCode(state),
      ownerName: 'Rahim',
      shopName: 'Fashion House',
    });
    expect(shop).toEqual({
      tenantId: 't-fashion-house',
      address: 'fashion-house',
      shopUrl: 'http://fashion-house.localhost:3000',
    });
    expect(state.owners).toEqual([{ tenantId: 't-fashion-house', phone: PHONE, name: 'Rahim' }]);
    expect(state.outbox.map((m) => m.kind)).toEqual(['otp', 'shop_ready']);
  });

  it('gives a suggestion, not a shop, when the typed address is taken', async () => {
    const state = world({ taken: ['fashion-house'] });
    const { signup } = build(state);
    await signup.requestCode(PHONE);
    await expect(
      signup.createShop({
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
    const state = world();
    const { signup } = build(state);
    await signup.requestCode(PHONE);
    await expect(
      signup.createShop({
        phone: PHONE,
        code: lastCode(state),
        ownerName: 'Rahim',
        shopName: 'ফ্যাশন হাউস',
      }),
    ).rejects.toMatchObject({ code: 'validation_error', details: { field: 'address' } });
  });

  it('answers a registered phone vaguely, and sends nothing more (AUTH-08)', async () => {
    const state = world({ registered: [PHONE] });
    const { signup } = build(state);
    await signup.requestCode(PHONE);
    await expect(
      signup.createShop({
        phone: PHONE,
        code: lastCode(state),
        ownerName: 'Rahim',
        shopName: 'Shop',
      }),
    ).rejects.toMatchObject({ code: 'conflict', message: 'Sign in to continue.' });
    expect(state.outbox.map((m) => m.kind)).toEqual(['otp']);
  });

  it('refuses a code already used, and an expired code', async () => {
    const state = world();
    const { signup } = build(state);
    await signup.requestCode(PHONE);
    const code = lastCode(state);
    await signup.createShop({ phone: PHONE, code, ownerName: 'A', shopName: 'Shop One' });
    await expect(
      signup.createShop({ phone: PHONE, code, ownerName: 'A', shopName: 'Shop Two' }),
    ).rejects.toMatchObject({ code: 'validation_error' });

    const late = world();
    const other = build(late);
    await other.signup.requestCode('01811111111');
    advance(late, CODE_TTL_MS + 1000);
    await expect(
      other.signup.createShop({
        phone: '01811111111',
        code: lastCode(late),
        ownerName: 'A',
        shopName: 'Late',
      }),
    ).rejects.toMatchObject({ code: 'validation_error' });
  });
});

describe('wrong codes and the lock (AUTH-06)', () => {
  it('reports the attempts left after a wrong code', async () => {
    const state = world();
    const { signup } = build(state);
    await signup.requestCode(PHONE);
    await expect(
      signup.createShop({ phone: PHONE, code: '000000', ownerName: 'A', shopName: 'Shop' }),
    ).rejects.toMatchObject({
      code: 'validation_error',
      details: { attemptsLeft: MAX_WRONG_ATTEMPTS - 1 },
    });
  });

  it('locks after five wrong codes, even when the sixth is correct', async () => {
    const state = world();
    const { signup } = build(state);
    await signup.requestCode(PHONE);
    const correct = lastCode(state);
    for (let i = 0; i < MAX_WRONG_ATTEMPTS - 1; i += 1) {
      await expect(
        signup.createShop({
          phone: PHONE,
          code: wrongCode(correct),
          ownerName: 'A',
          shopName: 'S',
        }),
      ).rejects.toBeInstanceOf(ApiError);
    }
    await expect(
      signup.createShop({ phone: PHONE, code: wrongCode(correct), ownerName: 'A', shopName: 'S' }),
    ).rejects.toMatchObject({ code: 'rate_limited' });
    await expect(
      signup.createShop({ phone: PHONE, code: correct, ownerName: 'A', shopName: 'Shop' }),
    ).rejects.toMatchObject({ code: 'rate_limited', retryAfterSeconds: LOCK_MS / 1000 });
    expect(state.shops).toHaveLength(0);
  });

  it('a locked number cannot ask for a new code until the lock ends', async () => {
    const state = world();
    const { signup } = build(state);
    await signup.requestCode(PHONE);
    const correct = lastCode(state);
    for (let i = 0; i < MAX_WRONG_ATTEMPTS; i += 1) {
      await signup
        .createShop({ phone: PHONE, code: wrongCode(correct), ownerName: 'A', shopName: 'S' })
        .catch(() => undefined);
    }
    await expect(signup.requestCode(PHONE)).rejects.toMatchObject({ code: 'rate_limited' });

    advance(state, LOCK_MS + 1000);
    await signup.requestCode(PHONE);
    await signup.createShop({
      phone: PHONE,
      code: lastCode(state),
      ownerName: 'A',
      shopName: 'Shop',
    });
    expect(state.shops).toHaveLength(1);
  });
});

describe('SMS delivery never blocks shop creation (SMS-18)', () => {
  it('creates the shop even when the ready message cannot be sent, and keeps the message for retry', async () => {
    const state = world();
    const { signup, messaging } = build(state);
    await signup.requestCode(PHONE);
    state.smsFails = true;

    const shop = await signup.createShop({
      phone: PHONE,
      code: lastCode(state),
      ownerName: 'Rahim',
      shopName: 'Fashion House',
    });
    expect(shop.tenantId).toBe('t-fashion-house');
    expect(state.shops).toHaveLength(1);

    const ready = state.outbox.find((m) => m.kind === 'shop_ready');
    expect(ready).toMatchObject({ status: 'pending', attempts: 1 });

    state.smsFails = false;
    advance(state, 2 * 60_000);
    expect(await messaging.runDue()).toBe(1);
    expect(state.outbox.find((m) => m.kind === 'shop_ready')?.status).toBe('sent');
  });

  it('reports a failed one-time code send, and never stores the code', async () => {
    const state = world();
    state.smsFails = true;
    const { signup } = build(state);
    await expect(signup.requestCode(PHONE)).rejects.toMatchObject({
      code: 'service_unavailable',
      retryAfterSeconds: 60,
    });

    const otp = state.outbox.find((m) => m.kind === 'otp');
    expect(otp?.body).toBeNull();
    expect(otp?.status).toBe('failed');
  });

  it('gives up after five attempts and marks the message failed', async () => {
    const state = world();
    const { signup, messaging } = build(state);
    await signup.requestCode(PHONE);
    state.smsFails = true;
    await signup.createShop({
      phone: PHONE,
      code: lastCode(state),
      ownerName: 'Rahim',
      shopName: 'Fashion House',
    });
    for (let i = 0; i < 4; i += 1) {
      advance(state, 2 * 60 * 60_000);
      await messaging.runDue();
    }
    expect(state.outbox.find((m) => m.kind === 'shop_ready')).toMatchObject({
      status: 'failed',
      attempts: 5,
    });
  });
});
