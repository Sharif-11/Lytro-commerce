import { describe, expect, it } from 'vitest';
import { ChallengeKind } from '@lytronix/validators';
import type { Transaction } from '@lytronix/db';
import { ApiError } from '../src/common/api-error';
import {
  CODE_TTL_MS,
  HOURLY_CODE_CAP,
  LOCK_MS,
  MAX_WRONG_ATTEMPTS,
  OneTimeCodeService,
  RESEND_COOLDOWN_MS,
} from '../src/modules/identity/services/one-time-code.service';
import type {
  ChallengeRecord,
  ChallengeStore,
} from '../src/modules/identity/ports/challenge-store';
import type { SignupSettings } from '../src/modules/identity/ports/signup-settings';
import { OneTimeCodeHasher } from '../src/modules/identity/services/one-time-code-hasher';
import { type MessageStore } from '../src/modules/shared/messaging/ports/message-store';
import { type SmsProvider } from '../src/modules/shared/messaging/ports/sms-provider';
import { MessagingService } from '../src/modules/shared/messaging/services/messaging.service';

// AUTH-05 to AUTH-07, tested through the real service with fake ports. Codes of every kind share these rules.
const SECRET = 's'.repeat(32);
const PHONE = '01711111111';
const TX = {} as Transaction;

interface World {
  now: Date;
  challenges: (ChallengeRecord & { phone: string })[];
  outbox: { id: number; kind: string; body: string | null; status: string }[];
  sent: { toPhone: string; body: string }[];
  smsFails: boolean;
  counter: number;
}

function world(): World {
  return {
    now: new Date('2026-10-06T10:00:00Z'),
    challenges: [],
    outbox: [],
    sent: [],
    smsFails: false,
    counter: 0,
  };
}

function build(state: World) {
  const challenges: ChallengeStore = {
    latest: (_tx, phone, kind) => {
      const rows = state.challenges.filter((c) => c.phone === phone && c.kind === kind);
      return Promise.resolve(rows[rows.length - 1] ?? null);
    },
    countSince: (_tx, phone, kind, since) =>
      Promise.resolve(
        state.challenges.filter((c) => c.phone === phone && c.kind === kind && c.createdAt > since)
          .length,
      ),
    create: (_tx, input) => {
      state.counter += 1;
      const id = `c${String(state.counter)}`;
      state.challenges.push({
        id,
        phone: input.phone,
        kind: input.kind,
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

  const messageStore: MessageStore = {
    insert: (_executor, message) => {
      state.counter += 1;
      state.outbox.push({
        id: state.counter,
        kind: message.kind,
        body: message.body,
        status: 'pending',
      });
      return Promise.resolve(state.counter);
    },
    claimDue: () => Promise.resolve([]),
    markSent: () => Promise.resolve(),
    markFailed: (id, input) => {
      const row = state.outbox.find((m) => m.id === id);
      if (row) row.status = input.nextAttemptAt ? 'pending' : 'failed';
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

  const settings: SignupSettings = {
    now: () => state.now,
    shopUrl: (address) => `http://${address}.localhost:3000`,
  };

  const gateway = { run: <T>(work: (tx: Transaction) => Promise<T>) => work(TX) };
  const codes = new OneTimeCodeService(
    challenges,
    gateway,
    settings,
    new OneTimeCodeHasher(SECRET),
    messaging,
  );
  return { codes, messaging, challenges };
}

/** The code most recently texted, read back from the provider log, since the outbox never stores a code. */
function lastCode(state: World): string {
  const body = state.sent[state.sent.length - 1]?.body ?? '';
  return /(\d{6})/.exec(body)?.[1] ?? '';
}

function advance(state: World, ms: number): void {
  state.now = new Date(state.now.getTime() + ms);
}

function wrongCode(correct: string): string {
  return correct === '000000' ? '111111' : '000000';
}

const SIGNIN = ChallengeKind.Signin;

describe('requesting a code (AUTH-05, AUTH-07)', () => {
  it('sends a six-digit code and stores only a keyed hash of it', async () => {
    const state = world();
    const { codes } = build(state);
    expect(await codes.issue(PHONE, SIGNIN)).toEqual({
      expiresInSeconds: CODE_TTL_MS / 1000,
      resendAfterSeconds: RESEND_COOLDOWN_MS / 1000,
    });
    const code = lastCode(state);
    expect(code).toMatch(/^\d{6}$/);
    expect(state.challenges[0]?.codeHash).toBe(new OneTimeCodeHasher(SECRET).hash(code, PHONE));
    expect(state.challenges[0]?.kind).toBe(SIGNIN);
  });

  it('refuses a resend within 60 seconds, with a retry hint', async () => {
    const state = world();
    const { codes } = build(state);
    await codes.issue(PHONE, SIGNIN);
    advance(state, 30_000);
    await expect(codes.issue(PHONE, SIGNIN)).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 30,
    });
    expect(state.sent).toHaveLength(1);
  });

  it('allows a request after the cooldown', async () => {
    const state = world();
    const { codes } = build(state);
    await codes.issue(PHONE, SIGNIN);
    advance(state, RESEND_COOLDOWN_MS);
    await codes.issue(PHONE, SIGNIN);
    expect(state.sent).toHaveLength(2);
  });

  it('refuses the sixth code in an hour', async () => {
    const state = world();
    const { codes } = build(state);
    for (let i = 0; i < HOURLY_CODE_CAP; i += 1) {
      await codes.issue(PHONE, SIGNIN);
      advance(state, RESEND_COOLDOWN_MS);
    }
    await expect(codes.issue(PHONE, SIGNIN)).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 3600,
    });
  });

  it('keeps reset codes and sign-in codes apart (AUTH-17)', async () => {
    const state = world();
    const { codes } = build(state);
    await codes.issue(PHONE, SIGNIN);
    advance(state, RESEND_COOLDOWN_MS);
    await codes.issue(PHONE, ChallengeKind.Reset);
    expect(state.sent.at(-1)?.body).toContain('password reset code');
    const signinCode = state.challenges.filter((c) => c.kind === SIGNIN);
    const resetCode = state.challenges.filter((c) => c.kind === ChallengeKind.Reset);
    expect(signinCode).toHaveLength(1);
    expect(resetCode).toHaveLength(1);
  });
});

describe('checking a code (AUTH-05, AUTH-06)', () => {
  it('accepts the correct code once', async () => {
    const state = world();
    const { codes } = build(state);
    await codes.issue(PHONE, SIGNIN);
    const id = await codes.verify(PHONE, lastCode(state), SIGNIN);
    expect(id).toBe(state.challenges[0]?.id);
  });

  it('reports the attempts left after a wrong code', async () => {
    const state = world();
    const { codes } = build(state);
    await codes.issue(PHONE, SIGNIN);
    await expect(codes.verify(PHONE, '000000', SIGNIN)).rejects.toMatchObject({
      code: 'validation_error',
      details: { attemptsLeft: MAX_WRONG_ATTEMPTS - 1 },
    });
  });

  it('locks after five wrong codes, even when the sixth is correct', async () => {
    const state = world();
    const { codes } = build(state);
    await codes.issue(PHONE, SIGNIN);
    const correct = lastCode(state);
    for (let i = 0; i < MAX_WRONG_ATTEMPTS - 1; i += 1) {
      await expect(codes.verify(PHONE, wrongCode(correct), SIGNIN)).rejects.toBeInstanceOf(
        ApiError,
      );
    }
    await expect(codes.verify(PHONE, wrongCode(correct), SIGNIN)).rejects.toMatchObject({
      code: 'rate_limited',
    });
    await expect(codes.verify(PHONE, correct, SIGNIN)).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: LOCK_MS / 1000,
    });
  });

  it('refuses a code already used, and an expired code', async () => {
    const state = world();
    const { codes } = build(state);
    await codes.issue(PHONE, SIGNIN);
    const code = lastCode(state);
    await codes.verify(PHONE, code, SIGNIN);
    expect(state.challenges[0]?.consumedAt).toBeNull();

    const late = world();
    const other = build(late);
    await other.codes.issue('01811111111', SIGNIN);
    advance(late, CODE_TTL_MS + 1000);
    await expect(other.codes.verify('01811111111', lastCode(late), SIGNIN)).rejects.toMatchObject({
      code: 'validation_error',
    });
  });
});

describe('SMS delivery failures (SMS-18)', () => {
  it('reports a failed one-time code send, and never stores the code', async () => {
    const state = world();
    state.smsFails = true;
    const { codes } = build(state);
    await expect(codes.issue(PHONE, SIGNIN)).rejects.toMatchObject({
      code: 'service_unavailable',
      retryAfterSeconds: 60,
    });
    const otp = state.outbox.find((m) => m.kind === 'otp');
    expect(otp?.body).toBeNull();
    expect(otp?.status).toBe('failed');
  });
});
