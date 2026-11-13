import { describe, expect, it } from 'vitest';
import {
  ChallengeChannel,
  ChallengeKind,
  RateKey,
  SmsLogKind,
  SmsLogStatus,
} from '@lytronix/validators';
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
import { type MailStore } from '../src/modules/shared/mail/ports/mail-store';
import { type MailProvider } from '../src/modules/shared/mail/ports/mail-provider';
import { MailService } from '../src/modules/shared/mail/services/mail.service';
import type { JobQueue } from '../src/modules/shared/queue/ports/job-queue';
import type { EssentialSmsUsageStore } from '../src/modules/sms-usage/ports/essential-sms-usage-store';
import { EssentialSmsUsageService } from '../src/modules/sms-usage/services/essential-sms-usage.service';
import type { UsageWarnings } from '../src/modules/usage-warnings/services/usage-warnings';
import type { BalanceService } from '../src/modules/balance/services/balance.service';
import type { RateService } from '../src/modules/balance/services/rate.service';
import type { SmsLogEntry } from '../src/modules/sms-usage/ports/sms-log-store';
import { SmsLog } from '../src/modules/sms-usage/services/sms-log';
import { SmsUnits } from '../src/modules/sms-usage/services/sms-units';

// AUTH-05 to AUTH-07, tested through the real service with fake ports. Codes of every kind share these rules.
const SECRET = 's'.repeat(32);
const PHONE = '01711111111';
const TX = {} as Transaction;

interface World {
  now: Date;
  challenges: ChallengeRecord[];
  outbox: { id: number; kind: string; body: string | null; status: string }[];
  sent: { toPhone: string; body: string }[];
  mailOutbox: { id: number; kind: string; body: string | null; status: string }[];
  mailSent: { to: string; subject: string; body: string }[];
  smsFails: boolean;
  mailFails: boolean;
  counter: number;
  queued: { queueName: string; payload: unknown }[];
  essentialSmsUsage: { id: string; tenantId: string; kind: string; units: number }[];
  /** The shop's limits as the usage warnings read them; null is unlimited. */
  limits: Record<string, number> | null;
  balanceRefuses: boolean;
  charges: { id: number; amount: string; units: string; rateUsed: string }[];
  credits: { amount: string; type: string; reference: unknown }[];
  smsLog: SmsLogEntry[];
  /** SMS-11: code SMS one address may ask for in an hour. */
  smsPerIp: number;
}

function world(): World {
  return {
    now: new Date('2026-10-06T10:00:00Z'),
    challenges: [],
    outbox: [],
    sent: [],
    mailOutbox: [],
    mailSent: [],
    smsFails: false,
    mailFails: false,
    counter: 0,
    queued: [],
    essentialSmsUsage: [],
    limits: null,
    balanceRefuses: false,
    charges: [],
    credits: [],
    smsLog: [],
    smsPerIp: 1000,
  };
}

function build(state: World) {
  const challenges: ChallengeStore = {
    holdRequests: () => Promise.resolve(),
    latest: (_tx, destination, channel, kind) => {
      const rows = state.challenges.filter(
        (c) => c.destination === destination && c.channel === channel && c.kind === kind,
      );
      return Promise.resolve(rows[rows.length - 1] ?? null);
    },
    countSince: (_tx, destination, channel, kind, since) =>
      Promise.resolve(
        state.challenges.filter(
          (c) =>
            c.destination === destination &&
            c.channel === channel &&
            c.kind === kind &&
            c.createdAt > since,
        ).length,
      ),
    countFromIpSince: (_tx, ip, channel, since) =>
      Promise.resolve(
        state.challenges.filter(
          (c) => c.requestedIp === ip && c.channel === channel && c.createdAt > since,
        ).length,
      ),
    create: (_tx, input) => {
      state.counter += 1;
      const id = `c${String(state.counter)}`;
      state.challenges.push({
        id,
        destination: input.destination,
        channel: input.channel,
        kind: input.kind,
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
        consumedAt: null,
        lockedUntil: null,
        attempts: 0,
        requestedIp: input.requestedIp,
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
    forgetShoppers: () => Promise.resolve(),
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
    countFailedForShop: () => Promise.resolve(0),
    failedForShop: () => Promise.resolve([]),
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
      return Promise.resolve({ providerMessageId: `p-${String(state.sent.length)}` });
    },
  };
  const jobQueue: JobQueue = {
    enqueue: (_tx, queueName, payload) => {
      state.queued.push({ queueName, payload });
      return Promise.resolve();
    },
  };
  const messaging = new MessagingService(messageStore, provider, () => state.now, jobQueue);

  const mailStore: MailStore = {
    insert: (_executor, message) => {
      state.counter += 1;
      state.mailOutbox.push({
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
      const row = state.mailOutbox.find((m) => m.id === id);
      if (row) row.status = input.nextAttemptAt ? 'pending' : 'failed';
      return Promise.resolve();
    },
    markSuppressed: () => Promise.resolve(),
    isSuppressed: () => Promise.resolve(false),
    lift: () => Promise.resolve(false),
    suppress: () => Promise.resolve(true),
  };
  const mailProvider: MailProvider = {
    send: (message) => {
      if (state.mailFails) return Promise.reject(new Error('provider down'));
      state.mailSent.push(message);
      return Promise.resolve({ providerMessageId: null });
    },
  };
  const mail = new MailService(mailStore, mailProvider, () => state.now);

  const settings: SignupSettings = {
    now: () => state.now,
    shopUrl: (address) => `http://${address}.localhost:3000`,
    dashboardUrl: (address) => `http://app.localhost:3000/${address}`,
  };

  const essentialSmsUsageStore: EssentialSmsUsageStore = {
    holdAllowance: () => Promise.resolve(),
    record: (_tx, values) => {
      state.counter += 1;
      const id = `usage-${String(state.counter)}`;
      state.essentialSmsUsage.push({ id, ...values });
      return Promise.resolve(id);
    },
    delete: (_tx, id) => {
      state.essentialSmsUsage = state.essentialSmsUsage.filter((row) => row.id !== id);
      return Promise.resolve();
    },
    sumUnitsSince: (tenantId) =>
      Promise.resolve(
        state.essentialSmsUsage
          .filter((row) => row.tenantId === tenantId)
          .reduce((sum, row) => sum + row.units, 0),
      ),
    findCycleTenant: () => Promise.resolve(null),
  };
  // LIM-01: the allowance's warnings are the usage warnings' own spec; here they only read the limits.
  const quietWarnings = {
    check: () => Promise.resolve(),
    limitsOf: () => Promise.resolve(state.limits),
  } as unknown as UsageWarnings;
  // SMS-09: the seeded rates, 0.55 TK a 67-character unit (D7-13).
  const rates = {
    current: (key: RateKey) =>
      Promise.resolve({ value: key === RateKey.SmsPerUnit ? '0.5500' : '67.0000' }),
  } as unknown as RateService;
  // BAL-10: the balance refuses a charge it can't pay; otherwise it records it.
  const balance = {
    charge: (_tx: Transaction, input: { units: string; rateUsed: string }) => {
      if (state.balanceRefuses) {
        return Promise.reject(new ApiError('quota_exceeded', 'InsufficientBalance', {}));
      }
      state.counter += 1;
      const amount = `-${(Number(input.units) * Number(input.rateUsed)).toFixed(2)}`;
      const entry = { id: state.counter, amount, units: input.units, rateUsed: input.rateUsed };
      state.charges.push(entry);
      return Promise.resolve(entry);
    },
    credit: (_tx: Transaction, input: { amount: string; type: string; reference: unknown }) => {
      state.credits.push(input);
      return Promise.resolve({});
    },
  } as unknown as BalanceService;
  const essentialSms = new EssentialSmsUsageService(
    essentialSmsUsageStore,
    quietWarnings,
    new SmsUnits(rates),
    balance,
  );
  const smsLog = new SmsLog({
    record: (entry) => {
      state.smsLog.push(entry);
      return Promise.resolve();
    },
  });

  const gateway = { run: <T>(work: (tx: Transaction) => Promise<T>) => work(TX) };
  const codes = new OneTimeCodeService(
    challenges,
    gateway,
    settings,
    new OneTimeCodeHasher(SECRET),
    messaging,
    mail,
    essentialSms,
    smsLog,
    state.smsPerIp,
  );
  return { codes, messaging, mail, challenges };
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
    expect(await codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN)).toEqual({
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
    await codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN);
    advance(state, 30_000);
    await expect(codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN)).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 30,
    });
    expect(state.sent).toHaveLength(1);
  });

  it('allows a request after the cooldown', async () => {
    const state = world();
    const { codes } = build(state);
    await codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN);
    advance(state, RESEND_COOLDOWN_MS);
    await codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN);
    expect(state.sent).toHaveLength(2);
  });

  it('refuses the sixth code in an hour', async () => {
    const state = world();
    const { codes } = build(state);
    for (let i = 0; i < HOURLY_CODE_CAP; i += 1) {
      await codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN);
      advance(state, RESEND_COOLDOWN_MS);
    }
    await expect(codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN)).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: 3600,
    });
  });

  it('keeps reset codes and sign-in codes apart (AUTH-17)', async () => {
    const state = world();
    const { codes } = build(state);
    await codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN);
    advance(state, RESEND_COOLDOWN_MS);
    await codes.issue(PHONE, ChallengeChannel.Sms, ChallengeKind.Reset);
    expect(state.sent.at(-1)?.body).toContain('পাসওয়ার্ড রিসেটের জন্য');
    const signinCode = state.challenges.filter((c) => c.kind === SIGNIN);
    const resetCode = state.challenges.filter((c) => c.kind === ChallengeKind.Reset);
    expect(signinCode).toHaveLength(1);
    expect(resetCode).toHaveLength(1);
  });
});

describe("AUTH-21, SMS-04 to SMS-08: a code that is a shop's own use", () => {
  const TENANT_ID = 'tenant-1';
  const COUNTED = { tenantId: TENANT_ID, kind: SmsLogKind.SigninCode };
  // The owner's words (Slice 7.1's read): one 67-character unit, at 0.55 TK.
  const SIGNIN_TEXT = /^Lytro-এ লগইনের জন্য OTP হচ্ছে \d{6}। কারো সাথে শেয়ার করবেন না।$/;

  it('with nothing counted (sign-up), nothing is taken or logged', async () => {
    const state = world();
    const { codes } = build(state);
    await codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN);
    expect(state.essentialSmsUsage).toHaveLength(0);
    expect(state.charges).toHaveLength(0);
    expect(state.smsLog).toHaveLength(0);
  });

  it("within the allowance, the code is free: counted to the shop's allowance and logged at no cost", async () => {
    const state = world();
    const { codes } = build(state);
    await codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN, { countedTo: COUNTED });
    expect(state.sent[0]?.body).toMatch(SIGNIN_TEXT);
    expect(
      state.essentialSmsUsage.map(({ tenantId, kind, units }) => ({ tenantId, kind, units })),
    ).toEqual([{ tenantId: TENANT_ID, kind: 'otp', units: 1 }]);
    expect(state.charges).toHaveLength(0);
    expect(state.smsLog).toEqual([
      {
        tenantId: TENANT_ID,
        kind: SmsLogKind.SigninCode,
        toPhone: PHONE,
        units: 1,
        cost: '0',
        isEssential: true,
        status: SmsLogStatus.Sent,
        providerMessageId: 'p-1',
      },
    ]);
  });

  it('past the allowance, the code is charged from the balance at the SMS rate', async () => {
    const state = world();
    state.limits = { essential_sms_monthly: 1 };
    const { codes } = build(state);
    await codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN, { countedTo: COUNTED });
    advance(state, RESEND_COOLDOWN_MS);
    await codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN, { countedTo: COUNTED });
    expect(state.essentialSmsUsage).toHaveLength(1);
    expect(
      state.charges.map(({ amount, units, rateUsed }) => ({ amount, units, rateUsed })),
    ).toEqual([{ amount: '-0.55', units: '1', rateUsed: '0.5500' }]);
    expect(state.smsLog.map((row) => [row.status, row.cost])).toEqual([
      [SmsLogStatus.Sent, '0'],
      [SmsLogStatus.Sent, '0.55'],
    ]);
  });

  it("TRL-03: a trial's total is the allowance, whatever its month says", async () => {
    const state = world();
    state.limits = { essential_sms_total: 0, essential_sms_monthly: 50 };
    const { codes } = build(state);
    await codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN, { countedTo: COUNTED });
    expect(state.essentialSmsUsage).toHaveLength(0);
    expect(state.charges).toHaveLength(1);
  });

  it("SMS-06: when the balance can't pay, nothing is sent and the refusal says why", async () => {
    const state = world();
    state.limits = { essential_sms_monthly: 0 };
    state.balanceRefuses = true;
    const { codes } = build(state);
    await expect(
      codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN, { countedTo: COUNTED }),
    ).rejects.toMatchObject({ code: 'quota_exceeded', messageKey: 'ShopCannotPayForCode' });
    expect(state.sent).toHaveLength(0);
    expect(state.smsLog).toEqual([
      {
        tenantId: TENANT_ID,
        kind: SmsLogKind.SigninCode,
        toPhone: PHONE,
        units: 1,
        cost: '0',
        isEssential: true,
        status: SmsLogStatus.Blocked,
        blockedReason: 'insufficient_balance',
      },
    ]);
  });

  it('SMS-08: a code that fails to send gives back the allowance it used', async () => {
    const state = world();
    state.smsFails = true;
    const { codes } = build(state);
    await expect(
      codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN, { countedTo: COUNTED }),
    ).rejects.toMatchObject({ messageKey: 'CodeSendFailed' });
    expect(state.essentialSmsUsage).toHaveLength(0);
    expect(state.smsLog.map((row) => [row.status, row.cost])).toEqual([[SmsLogStatus.Failed, '0']]);
  });

  it('SMS-08: a charged code that fails to send is credited back', async () => {
    const state = world();
    state.limits = { essential_sms_monthly: 0 };
    state.smsFails = true;
    const { codes } = build(state);
    await expect(
      codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN, { countedTo: COUNTED }),
    ).rejects.toMatchObject({ messageKey: 'CodeSendFailed' });
    const charge = state.charges[0];
    expect(state.credits).toEqual([
      {
        tenantId: TENANT_ID,
        type: 'reversal',
        amount: '0.55',
        reference: { reverses: charge?.id, reason: 'sms_not_sent' },
      },
    ]);
  });

  it('AUTH-13/P1-E10: within the allowance, the response reads the same counted or not', async () => {
    const state = world();
    const { codes } = build(state);
    const unknown = await codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN);
    advance(state, RESEND_COOLDOWN_MS);
    const known = await codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN, { countedTo: COUNTED });
    expect(known).toEqual(unknown);
  });

  it("issue() counts whatever its caller says is the shop's use, a reset code too", async () => {
    const state = world();
    const { codes } = build(state);
    // ForgotPasswordService passes a shop only for a staff member's reset; the owner's own is Lytro's cost.
    await codes.issue(PHONE, ChallengeChannel.Sms, ChallengeKind.Reset, {
      countedTo: { tenantId: TENANT_ID, kind: SmsLogKind.StaffResetCode },
    });
    expect(state.sent[0]?.body).toMatch(
      /^Lytro-এ পাসওয়ার্ড রিসেটের জন্য OTP হচ্ছে \d{6}। কারো সাথে শেয়ার করবেন না।$/,
    );
    expect(state.essentialSmsUsage).toHaveLength(1);
    expect(state.smsLog[0]?.kind).toBe(SmsLogKind.StaffResetCode);
  });

  it('an email-channel code never counts, even when its caller names a shop', async () => {
    const state = world();
    const { codes } = build(state);
    await codes.issue('owner@example.com', ChallengeChannel.Email, SIGNIN, { countedTo: COUNTED });
    expect(state.essentialSmsUsage).toHaveLength(0);
    expect(state.smsLog).toHaveLength(0);
  });
});

describe('SMS-11, D7-27: code SMS from one address', () => {
  const IP = '203.0.113.5';

  it('stops at the cap across every phone, for an hour, and never touches another address', async () => {
    const state = world();
    state.smsPerIp = 2;
    const { codes } = build(state);
    await codes.issue('01711111111', ChallengeChannel.Sms, SIGNIN, { ip: IP });
    await codes.issue('01722222222', ChallengeChannel.Sms, ChallengeKind.Reset, { ip: IP });
    await expect(
      codes.issue('01733333333', ChallengeChannel.Sms, SIGNIN, { ip: IP }),
    ).rejects.toMatchObject({ code: 'rate_limited', messageKey: 'TooManyCodesRequested' });
    expect(state.sent).toHaveLength(2);
    await codes.issue('01733333333', ChallengeChannel.Sms, SIGNIN, { ip: '198.51.100.7' });
    advance(state, 60 * 60 * 1000 + 1);
    await codes.issue('01744444444', ChallengeChannel.Sms, SIGNIN, { ip: IP });
    expect(state.sent).toHaveLength(4);
  });

  it('never counts an address the server cannot trust, or an email code', async () => {
    const state = world();
    state.smsPerIp = 1;
    const { codes } = build(state);
    await codes.issue('01711111111', ChallengeChannel.Sms, SIGNIN, { ip: null });
    await codes.issue('01722222222', ChallengeChannel.Sms, SIGNIN);
    await codes.issue('a@example.com', ChallengeChannel.Email, SIGNIN, { ip: IP });
    await codes.issue('b@example.com', ChallengeChannel.Email, SIGNIN, { ip: IP });
    await codes.issue('01733333333', ChallengeChannel.Sms, SIGNIN, { ip: IP });
    expect(state.challenges.map((c) => c.requestedIp)).toEqual([null, null, IP, IP, IP]);
  });
});

describe('checking a code (AUTH-05, AUTH-06)', () => {
  it('accepts the correct code once', async () => {
    const state = world();
    const { codes } = build(state);
    await codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN);
    const id = await codes.verify(PHONE, ChallengeChannel.Sms, lastCode(state), SIGNIN);
    expect(id).toBe(state.challenges[0]?.id);
  });

  it('reports the attempts left after a wrong code', async () => {
    const state = world();
    const { codes } = build(state);
    await codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN);
    await expect(codes.verify(PHONE, ChallengeChannel.Sms, '000000', SIGNIN)).rejects.toMatchObject(
      {
        code: 'validation_error',
        details: { attemptsLeft: MAX_WRONG_ATTEMPTS - 1 },
      },
    );
  });

  it('locks after five wrong codes, even when the sixth is correct', async () => {
    const state = world();
    const { codes } = build(state);
    await codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN);
    const correct = lastCode(state);
    for (let i = 0; i < MAX_WRONG_ATTEMPTS - 1; i += 1) {
      await expect(
        codes.verify(PHONE, ChallengeChannel.Sms, wrongCode(correct), SIGNIN),
      ).rejects.toBeInstanceOf(ApiError);
    }
    await expect(
      codes.verify(PHONE, ChallengeChannel.Sms, wrongCode(correct), SIGNIN),
    ).rejects.toMatchObject({
      code: 'rate_limited',
    });
    await expect(codes.verify(PHONE, ChallengeChannel.Sms, correct, SIGNIN)).rejects.toMatchObject({
      code: 'rate_limited',
      retryAfterSeconds: LOCK_MS / 1000,
    });
  });

  it('refuses a code already used, and an expired code', async () => {
    const state = world();
    const { codes } = build(state);
    await codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN);
    const code = lastCode(state);
    await codes.verify(PHONE, ChallengeChannel.Sms, code, SIGNIN);
    expect(state.challenges[0]?.consumedAt).toBeNull();

    const late = world();
    const other = build(late);
    await other.codes.issue('01811111111', ChallengeChannel.Sms, SIGNIN);
    advance(late, CODE_TTL_MS + 1000);
    await expect(
      other.codes.verify('01811111111', ChallengeChannel.Sms, lastCode(late), SIGNIN),
    ).rejects.toMatchObject({
      code: 'validation_error',
    });
  });
});

describe('SMS delivery failures (SMS-18)', () => {
  it('reports a failed one-time code send, and never stores the code', async () => {
    const state = world();
    state.smsFails = true;
    const { codes } = build(state);
    await expect(codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN)).rejects.toMatchObject({
      code: 'service_unavailable',
      retryAfterSeconds: 60,
    });
    const otp = state.outbox.find((m) => m.kind === 'otp');
    expect(otp?.body).toBeNull();
    expect(otp?.status).toBe('failed');
  });

  it('queues a bounded retry carrying the code, while it is still valid (D27)', async () => {
    const state = world();
    state.smsFails = true;
    const { codes } = build(state);
    await expect(codes.issue(PHONE, ChallengeChannel.Sms, SIGNIN)).rejects.toMatchObject({
      code: 'service_unavailable',
    });
    expect(state.queued).toHaveLength(1);
    expect(state.queued[0]?.queueName).toBe('otp_retry');
    expect(state.queued[0]?.payload).toMatchObject({ toPhone: PHONE });
  });

  it('never queues a retry for an email delivery failure, and never stores the code', async () => {
    const state = world();
    state.mailFails = true;
    const { codes } = build(state);
    await expect(
      codes.issue('a@example.com', ChallengeChannel.Email, SIGNIN),
    ).rejects.toMatchObject({ code: 'service_unavailable' });
    expect(state.queued).toHaveLength(0);
    const otp = state.mailOutbox.find((m) => m.kind === 'otp');
    expect(otp?.body).toBeNull();
    expect(otp?.status).toBe('failed');
  });
});
