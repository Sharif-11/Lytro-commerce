import { randomUUID } from 'node:crypto';
import { generate } from 'otplib';
import { describe, expect, it } from 'vitest';
import type { Transaction } from '@lytronix/db';
import { PasswordHasher } from '../src/modules/identity/services/password-hasher';
import {
  OPERATOR_SESSION_COOKIE,
  OperatorAuthService,
} from '../src/modules/operator/services/operator-auth.service';
import { TotpService } from '../src/modules/operator/services/totp.service';
import type {
  OperatorAccountRecord,
  OperatorBackupCodeRecord,
  OperatorGateway,
  OperatorSessionRecord,
} from '../src/modules/operator/ports/operator-gateway';
import type { OperatorSessionSettings } from '../src/modules/operator/types/session';

// ADM-01, ADM-18, D8: operator sign-in, tested through the real service with a fake gateway. The real
// PasswordHasher (bcrypt) and TotpService (otplib) are used as-is — there is nothing to fake about either,
// and faking bcrypt's timing would undercut the one test that checks it.
const TX = {} as Transaction;
const EMAIL = 'operator@lytronix.internal';
const PASSWORD = 'correct-pw9'; // 8–20 chars (PASSWORD_MAX_LENGTH), matching the e2e spec
const CONTEXT = { userAgent: null, ip: null };
// Real bcrypt at cost 12 (D2) is deliberately slow, and enrollment alone hashes eleven values (the password
// plus ten backup codes); the default 5s test timeout is too tight once a test enrolls and then does anything
// else. Matches the same per-test timeout override password.e2e.spec.ts already uses for its own bcrypt-heavy
// lockout tests.
const BCRYPT_TIMEOUT_MS = 20_000;

interface World {
  accounts: OperatorAccountRecord[];
  backupCodes: OperatorBackupCodeRecord[];
  usedBackupCodeIds: Set<string>;
  sessions: (OperatorSessionRecord & {
    tokenHash: string;
    expiresAt: Date;
    revokedAt: Date | null;
  })[];
  now: Date;
  counter: number;
}

function world(): World {
  return {
    accounts: [],
    backupCodes: [],
    usedBackupCodeIds: new Set(),
    sessions: [],
    now: new Date('2026-10-08T10:00:00Z'),
    counter: 0,
  };
}

function build(state: World) {
  const gateway: OperatorGateway = {
    run: <T>(work: (tx: Transaction) => Promise<T>) => work(TX),
    findByEmail: (_tx, email) =>
      Promise.resolve(state.accounts.find((a) => a.email === email) ?? null),
    setTwoFactorSecret: (_tx, operatorId, secret) => {
      const account = state.accounts.find((a) => a.id === operatorId);
      if (account) {
        account.twoFactorSecret = secret;
        account.twoFactorConfirmedAt = null;
      }
      return Promise.resolve();
    },
    confirmTwoFactor: (_tx, operatorId, at) => {
      const account = state.accounts.find((a) => a.id === operatorId);
      if (account) account.twoFactorConfirmedAt = at;
      return Promise.resolve();
    },
    // This fake never filters by operator id — every test here only ever has one operator, so a flat list
    // keyed by backup-code id is enough; the real adapter's SQL does the actual per-operator filtering.
    insertBackupCodes: (_tx, _operatorId, codeHashes) => {
      for (const codeHash of codeHashes) {
        state.counter += 1;
        state.backupCodes.push({ id: `bc${String(state.counter)}`, codeHash });
      }
      return Promise.resolve();
    },
    findValidBackupCodes: () =>
      Promise.resolve(state.backupCodes.filter((c) => !state.usedBackupCodeIds.has(c.id))),
    markBackupCodeUsed: (_tx, id) => {
      state.usedBackupCodeIds.add(id);
      return Promise.resolve();
    },
    insertSession: (_tx, values) => {
      state.counter += 1;
      state.sessions.push({
        id: `s${String(state.counter)}`,
        operatorId: values.operatorId,
        csrfHash: values.csrfHash,
        tokenHash: values.tokenHash,
        expiresAt: values.expiresAt,
        revokedAt: null,
      });
      return Promise.resolve();
    },
    findActiveSession: (tokenHash, now) =>
      Promise.resolve(
        state.sessions.find(
          (s) => s.tokenHash === tokenHash && !s.revokedAt && s.expiresAt > now,
        ) ?? null,
      ),
    revokeSession: (sessionId, at) => {
      const session = state.sessions.find((s) => s.id === sessionId);
      if (session) session.revokedAt = at;
      return Promise.resolve();
    },
  };

  const settings: OperatorSessionSettings = { now: () => state.now, secureCookies: false };
  const service = new OperatorAuthService(
    gateway,
    new PasswordHasher(),
    new TotpService(),
    settings,
  );
  return { service, gateway };
}

function addAccount(state: World, passwordHash: string): OperatorAccountRecord {
  const account: OperatorAccountRecord = {
    id: randomUUID(),
    email: EMAIL,
    passwordHash,
    twoFactorSecret: null,
    twoFactorConfirmedAt: null,
  };
  state.accounts.push(account);
  return account;
}

describe('operator sign-in, password step (ADM-01)', () => {
  it('refuses an unknown email and a wrong password identically', async () => {
    const state = world();
    const { service } = build(state);
    addAccount(state, await new PasswordHasher().hash(PASSWORD));

    await expect(service.signin('unknown@lytronix.internal', PASSWORD)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(service.signin(EMAIL, 'wrong password')).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('issues a secret on first sign-in, and the same one again until confirmed', async () => {
    const state = world();
    const { service } = build(state);
    addAccount(state, await new PasswordHasher().hash(PASSWORD));

    const first = await service.signin(EMAIL, PASSWORD);
    expect(first.next).toBe('enroll-2fa');
    if (first.next !== 'enroll-2fa') throw new Error('expected enroll-2fa');

    const second = await service.signin(EMAIL, PASSWORD);
    if (second.next !== 'enroll-2fa') throw new Error('expected enroll-2fa');
    expect(second.secret).toBe(first.secret);
    expect(second.uri).toContain(encodeURIComponent(EMAIL));
  });

  it('tells an already-enrolled account to verify, with no secret exposed again', async () => {
    const state = world();
    const { service } = build(state);
    const account = addAccount(state, await new PasswordHasher().hash(PASSWORD));
    account.twoFactorSecret = 'ALREADYCONFIRMEDSECRET';
    account.twoFactorConfirmedAt = state.now;

    expect(await service.signin(EMAIL, PASSWORD)).toEqual({ next: 'verify-2fa' });
  });
});

describe('operator enrollment (ADM-01)', () => {
  it('refuses a wrong or malformed code, and never confirms on failure', async () => {
    const state = world();
    const { service } = build(state);
    addAccount(state, await new PasswordHasher().hash(PASSWORD));
    await service.signin(EMAIL, PASSWORD);

    await expect(service.enroll(EMAIL, PASSWORD, '000000', CONTEXT)).rejects.toMatchObject({
      code: 'validation_error',
    });
    await expect(service.enroll(EMAIL, PASSWORD, 'not-a-code', CONTEXT)).rejects.toMatchObject({
      code: 'validation_error',
    });
    expect(state.accounts[0]?.twoFactorConfirmedAt).toBeNull();
  });

  it(
    'confirms with the right code, opens a session, and returns ten backup codes once',
    async () => {
      const state = world();
      const { service } = build(state);
      addAccount(state, await new PasswordHasher().hash(PASSWORD));
      const signedIn = await service.signin(EMAIL, PASSWORD);
      if (signedIn.next !== 'enroll-2fa') throw new Error('expected enroll-2fa');

      const code = await generate({ secret: signedIn.secret });
      const enrolled = await service.enroll(EMAIL, PASSWORD, code, CONTEXT);

      expect(enrolled.backupCodes).toHaveLength(10);
      expect(new Set(enrolled.backupCodes).size).toBe(10); // all distinct
      expect(enrolled.cookie).toContain(`${OPERATOR_SESSION_COOKIE}=`);
      expect(state.accounts[0]?.twoFactorConfirmedAt).toEqual(state.now);
      expect(state.sessions).toHaveLength(1);
    },
    BCRYPT_TIMEOUT_MS,
  );

  it('refuses enrolling an account that is already confirmed', async () => {
    const state = world();
    const { service } = build(state);
    const account = addAccount(state, await new PasswordHasher().hash(PASSWORD));
    account.twoFactorSecret = 'SOMESECRET';
    account.twoFactorConfirmedAt = state.now;

    await expect(service.enroll(EMAIL, PASSWORD, '123456', CONTEXT)).rejects.toMatchObject({
      code: 'conflict',
    });
  });
});

describe('operator verification, every sign-in once enrolled (ADM-01)', () => {
  async function enrolledAccount(
    state: World,
  ): Promise<{ service: OperatorAuthService; secret: string; backupCodes: string[] }> {
    const { service } = build(state);
    addAccount(state, await new PasswordHasher().hash(PASSWORD));
    const signedIn = await service.signin(EMAIL, PASSWORD);
    if (signedIn.next !== 'enroll-2fa') throw new Error('expected enroll-2fa');
    const code = await generate({ secret: signedIn.secret });
    const enrolled = await service.enroll(EMAIL, PASSWORD, code, CONTEXT);
    return { service, secret: signedIn.secret, backupCodes: enrolled.backupCodes };
  }

  it(
    'opens a session with a correct TOTP code',
    async () => {
      const state = world();
      const { service, secret } = await enrolledAccount(state);
      const code = await generate({ secret });
      const opened = await service.verify(EMAIL, PASSWORD, code, CONTEXT);
      expect(opened.cookie).toContain(`${OPERATOR_SESSION_COOKIE}=`);
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'refuses a wrong TOTP code',
    async () => {
      const state = world();
      const { service, secret } = await enrolledAccount(state);
      const real = await generate({ secret });
      const wrong = real === '000000' ? '111111' : '000000';
      await expect(service.verify(EMAIL, PASSWORD, wrong, CONTEXT)).rejects.toMatchObject({
        code: 'unauthenticated',
      });
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'accepts a backup code once, then refuses it on reuse (ADM-01)',
    async () => {
      const state = world();
      const { service, backupCodes } = await enrolledAccount(state);
      const used = backupCodes[0];
      if (!used) throw new Error('expected a backup code');

      const opened = await service.verify(EMAIL, PASSWORD, used, CONTEXT);
      expect(opened.cookie).toContain(`${OPERATOR_SESSION_COOKIE}=`);

      await expect(service.verify(EMAIL, PASSWORD, used, CONTEXT)).rejects.toMatchObject({
        code: 'unauthenticated',
      });
    },
    BCRYPT_TIMEOUT_MS,
  );

  it('refuses sign-in before enrollment is confirmed', async () => {
    const state = world();
    const { service } = build(state);
    addAccount(state, await new PasswordHasher().hash(PASSWORD));
    await service.signin(EMAIL, PASSWORD); // issues the secret, does not confirm

    await expect(service.verify(EMAIL, PASSWORD, '123456', CONTEXT)).rejects.toMatchObject({
      code: 'forbidden',
      details: { next: 'enroll-2fa' },
    });
  });
});

describe('operator session lookup and sign-out (SEC-14, D8)', () => {
  it(
    'resolves an active session from its cookie, and nothing once revoked',
    async () => {
      const state = world();
      const { service } = build(state);
      addAccount(state, await new PasswordHasher().hash(PASSWORD));
      const signedIn = await service.signin(EMAIL, PASSWORD);
      if (signedIn.next !== 'enroll-2fa') throw new Error('expected enroll-2fa');
      const code = await generate({ secret: signedIn.secret });
      const enrolled = await service.enroll(EMAIL, PASSWORD, code, CONTEXT);

      const cookieHeader = enrolled.cookie.split(';')[0];
      const resolved = await service.resolve(cookieHeader);
      if (!resolved) throw new Error('expected an active session');
      expect(service.csrfMatches(resolved, enrolled.csrfToken)).toBe(true);
      expect(service.csrfMatches(resolved, 'wrong-token')).toBe(false);

      await service.revoke(resolved.id);
      expect(await service.resolve(cookieHeader)).toBeNull();
    },
    BCRYPT_TIMEOUT_MS,
  );

  it('never matches a request with no CSRF header', () => {
    const { service } = build(world());
    expect(service.csrfMatches({ csrfHash: 'anything' }, undefined)).toBe(false);
  });
});
