import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { cookieFrom, getJson, type HttpResult, postJson } from './support/http';

// Operator sign-in, TOTP enrolment and backup codes, over real HTTP and the real database (ADM-01, SEC-14,
// D8). Runs only when DATABASE_TEST_ADMIN_URL is set, which CI always does.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_operator_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

// Real bcrypt at cost 12 (D2), the same reason password.e2e.spec.ts gives its own lockout tests more time.
const BCRYPT_TIMEOUT_MS = 30_000;
const PASSWORD = 'correct-pw9'; // 8–20 chars (PASSWORD_MAX_LENGTH)

let app: INestApplication;
let port: number;
let admin: pg.Client;

const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  postJson(port, path, payload, headers);

const freshEmail = (): string => `operator.${randomUUID().slice(0, 8)}@lytronix.internal`;

/** Inserts an operator account directly: the app role has no INSERT grant here (migration 0024) — only the
 *  create-operator script does this for real, so the test mirrors that by going straight to the schema owner. */
async function createOperator(email: string): Promise<void> {
  const passwordHash = await hash(PASSWORD, 12);
  await admin.query(
    'INSERT INTO control.operator_accounts (email, password_hash) VALUES ($1, $2)',
    [email, passwordHash],
  );
}

interface EnrollResult {
  csrfToken: string;
  backupCodes: string[];
}

interface Enrolled {
  cookie: string;
  csrfToken: string;
  backupCodes: string[];
  /** The confirmed TOTP secret, so a later test can generate a fresh, still-valid code to verify with. */
  secret: string;
}

/** Signs in and completes enrollment, returning the session, backup codes and the now-confirmed secret. */
async function enroll(email: string): Promise<Enrolled> {
  const signedIn = await post('/auth/operator/signin', { email, password: PASSWORD });
  const { secret } = signedIn.body as { next: string; secret: string; uri: string };
  const code = await generate({ secret });
  const response = await post('/auth/operator/enroll', { email, password: PASSWORD, code });
  const body = response.body as EnrollResult;
  return {
    cookie: cookieFrom(response),
    csrfToken: body.csrfToken,
    backupCodes: body.backupCodes,
    secret,
  };
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'operator-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

describeIfDatabase('operator sign-in (ADM-01)', () => {
  it(
    'refuses an unknown email — a tenant credential has no account here',
    async () => {
      const response = await post('/auth/operator/signin', {
        email: freshEmail(),
        password: PASSWORD,
      });
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ error: { code: 'unauthenticated' } });
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'refuses a wrong password for a real operator, with the same reply as an unknown email',
    async () => {
      const email = freshEmail();
      await createOperator(email);
      const wrong = await post('/auth/operator/signin', { email, password: 'wrong password' });
      const unknown = await post('/auth/operator/signin', {
        email: freshEmail(),
        password: PASSWORD,
      });
      expect(wrong.status).toBe(401);
      expect(wrong.body).toEqual(unknown.body);
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'tells a fresh account to enroll, with a secret and otpauth:// URI, shown once',
    async () => {
      const email = freshEmail();
      await createOperator(email);
      const response = await post('/auth/operator/signin', { email, password: PASSWORD });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ next: 'enroll-2fa' });
      const body = response.body as { secret: string; uri: string };
      expect(body.secret).toMatch(/^[A-Z2-7]+=*$/); // base32
      expect(body.uri).toContain('otpauth://totp/');
    },
    BCRYPT_TIMEOUT_MS,
  );
});

describeIfDatabase('operator 2FA enrollment (ADM-01)', () => {
  it(
    'refuses a wrong code and never confirms the account',
    async () => {
      const email = freshEmail();
      await createOperator(email);
      await post('/auth/operator/signin', { email, password: PASSWORD });
      const response = await post('/auth/operator/enroll', {
        email,
        password: PASSWORD,
        code: '000000',
      });
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: { code: 'validation_error' } });
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'confirms with the right code, opens a session, and issues ten single-use backup codes once',
    async () => {
      const email = freshEmail();
      await createOperator(email);
      const { cookie, backupCodes } = await enroll(email);

      expect(cookie).toContain('lytronix_operator_session=');
      expect(backupCodes).toHaveLength(10);
      expect(new Set(backupCodes).size).toBe(10);

      // Enrolled now: a second enroll attempt is refused outright.
      const again = await post('/auth/operator/enroll', {
        email,
        password: PASSWORD,
        code: '123456',
      });
      expect(again.status).toBe(409);
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    "a confirmed account's next sign-in asks to verify, not enroll",
    async () => {
      const email = freshEmail();
      await createOperator(email);
      await enroll(email);
      const response = await post('/auth/operator/signin', { email, password: PASSWORD });
      expect(response.body).toEqual({ next: 'verify-2fa' });
    },
    BCRYPT_TIMEOUT_MS,
  );
});

describeIfDatabase('operator verification and session (ADM-01, SEC-14)', () => {
  it(
    'opens a session with a correct TOTP code, refused with a wrong one',
    async () => {
      const email = freshEmail();
      await createOperator(email);
      const { secret } = await enroll(email);

      // Verified with the fresh code first, before anything else risks crossing a 30s TOTP window boundary.
      const code = await generate({ secret });
      const opened = await post('/auth/operator/verify', { email, password: PASSWORD, code });
      expect(opened.status).toBe(200);
      expect(cookieFrom(opened)).toContain('lytronix_operator_session=');

      // '000000' has a 1-in-a-million chance of matching by accident — the same tolerance every wrong-code
      // check elsewhere in this codebase already accepts (e.g. the enroll test above).
      const refused = await post('/auth/operator/verify', {
        email,
        password: PASSWORD,
        code: '000000',
      });
      expect(refused.status).toBe(401);
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'uses a backup code once, then refuses it on reuse',
    async () => {
      const email = freshEmail();
      await createOperator(email);
      const { backupCodes } = await enroll(email);
      const code = backupCodes[0];
      if (!code) throw new Error('expected a backup code');

      const first = await post('/auth/operator/verify', { email, password: PASSWORD, code });
      expect(first.status).toBe(200);
      expect(cookieFrom(first)).toContain('lytronix_operator_session=');

      const second = await post('/auth/operator/verify', { email, password: PASSWORD, code });
      expect(second.status).toBe(401);
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'regenerates backup codes, invalidating the old set and auditing the action (ADM-01)',
    async () => {
      const email = freshEmail();
      await createOperator(email);
      const { cookie, csrfToken, backupCodes, secret } = await enroll(email);
      const oldCode = backupCodes[0];
      if (!oldCode) throw new Error('expected a backup code');

      const totp = await generate({ secret });
      const regenerated = await post(
        '/auth/operator/backup-codes/regenerate',
        { password: PASSWORD, code: totp },
        { cookie, 'x-csrf-token': csrfToken },
      );
      expect(regenerated.status).toBe(200);
      const fresh = (regenerated.body as { backupCodes: string[] }).backupCodes;
      expect(fresh).toHaveLength(10);
      expect(fresh.some((code) => backupCodes.includes(code))).toBe(false);

      // The old code, never used, is now refused.
      const refused = await post('/auth/operator/verify', {
        email,
        password: PASSWORD,
        code: oldCode,
      });
      expect(refused.status).toBe(401);

      // A fresh code works.
      const accepted = await post('/auth/operator/verify', {
        email,
        password: PASSWORD,
        code: fresh[0],
      });
      expect(accepted.status).toBe(200);

      const account = await admin.query<{ id: string }>(
        'SELECT id FROM control.operator_accounts WHERE email = $1',
        [email],
      );
      const operatorId = account.rows[0]?.id;
      const audit = await admin.query<{ count: string }>(
        `SELECT count(*)::text FROM control.platform_audit_log
         WHERE action = 'backup_codes_regenerated' AND target_id = $1`,
        [operatorId],
      );
      expect(audit.rows[0]?.count).toBe('1');
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'refuses regenerating with a wrong password, and refuses with no CSRF token at all',
    async () => {
      const email = freshEmail();
      await createOperator(email);
      const { cookie, csrfToken, secret } = await enroll(email);
      const totp = await generate({ secret });

      const wrongPassword = await post(
        '/auth/operator/backup-codes/regenerate',
        { password: 'not the password', code: totp },
        { cookie, 'x-csrf-token': csrfToken },
      );
      expect(wrongPassword.status).toBe(401);

      const noCsrf = await post(
        '/auth/operator/backup-codes/regenerate',
        { password: PASSWORD, code: totp },
        { cookie },
      );
      expect(noCsrf.status).toBe(403);
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'signs out, invalidating the session at once',
    async () => {
      const email = freshEmail();
      await createOperator(email);
      const { cookie, csrfToken } = await enroll(email);

      const signedOut = await post(
        '/auth/operator/signout',
        {},
        { cookie, 'x-csrf-token': csrfToken },
      );
      expect(signedOut.status).toBe(200);

      const reused = await post(
        '/auth/operator/signout',
        {},
        { cookie, 'x-csrf-token': csrfToken },
      );
      expect(reused.status).toBe(401);
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'refuses a mutating request with no CSRF token, even with a valid session cookie',
    async () => {
      const email = freshEmail();
      await createOperator(email);
      const { cookie } = await enroll(email);

      const response: HttpResult = await post('/auth/operator/signout', {}, { cookie });
      expect(response.status).toBe(403);
    },
    BCRYPT_TIMEOUT_MS,
  );
});

describeIfDatabase("the sign-in limit (ADM-01, on AUTH-14's rule)", () => {
  const failuresOf = async (email: string): Promise<number> => {
    const counted = await admin.query<{ total: string }>(
      `SELECT count(*) AS total FROM control.sign_in_failures f
       JOIN control.operator_accounts a ON a.id = f.operator_id WHERE a.email = $1`,
      [email],
    );
    return Number(counted.rows[0]?.total ?? 0);
  };
  const LIMIT_TIMEOUT_MS = 90_000;

  it(
    'counts wrong passwords and wrong codes together, says the tries left at the code, then refuses even the right ones',
    async () => {
      const email = freshEmail();
      await createOperator(email);
      const { secret } = await enroll(email);
      const wrongCode = (await generate({ secret })) === '000000' ? '000001' : '000000';

      // Two wrong passwords say nothing of how many are left.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const wrong = await post('/auth/operator/signin', { email, password: 'wrong-password1' });
        expect(wrong.status).toBe(401);
        expect(JSON.stringify(wrong.body)).not.toContain('attemptsLeft');
      }
      // Three wrong codes, at the step where the password is proven, count down from what is left.
      for (const left of [2, 1, 0]) {
        const wrong = await post('/auth/operator/verify', {
          email,
          password: PASSWORD,
          code: wrongCode,
        });
        expect(wrong.status).toBe(401);
        expect(wrong.body).toMatchObject({
          error: { code: 'unauthenticated', details: { attemptsLeft: left } },
        });
      }
      expect(await failuresOf(email)).toBe(5);

      const lockedPassword = await post('/auth/operator/signin', { email, password: PASSWORD });
      expect(lockedPassword.status).toBe(429);
      expect(lockedPassword.body).toMatchObject({ error: { code: 'rate_limited' } });
      const lockedCode = await post('/auth/operator/verify', {
        email,
        password: PASSWORD,
        code: await generate({ secret }),
      });
      expect(lockedCode.status).toBe(429);

      // Past the fifteen minutes the right code signs in again.
      await admin.query(
        `UPDATE control.sign_in_failures SET created_at = now() - interval '16 minutes'
         WHERE operator_id = (SELECT id FROM control.operator_accounts WHERE email = $1)`,
        [email],
      );
      const back = await post('/auth/operator/verify', {
        email,
        password: PASSWORD,
        code: await generate({ secret }),
      });
      expect(back.status).toBe(200);
    },
    LIMIT_TIMEOUT_MS,
  );

  it(
    'counts a wrong code at enrolment, and a wrong backup code',
    async () => {
      const email = freshEmail();
      await createOperator(email);
      const signedIn = await post('/auth/operator/signin', { email, password: PASSWORD });
      expect(signedIn.status).toBe(200);
      const enrol = await post('/auth/operator/enroll', {
        email,
        password: PASSWORD,
        code: '000000',
      });
      expect(enrol.status).toBe(400);
      expect(await failuresOf(email)).toBe(1);

      const { secret } = signedIn.body as { secret: string };
      const enrolled = await post('/auth/operator/enroll', {
        email,
        password: PASSWORD,
        code: await generate({ secret }),
      });
      expect(enrolled.status).toBe(200);
      const backup = await post('/auth/operator/verify', {
        email,
        password: PASSWORD,
        code: 'not-a-real-backup',
      });
      expect(backup.status).toBe(401);
      expect(backup.body).toMatchObject({ error: { details: { attemptsLeft: 3 } } });
    },
    LIMIT_TIMEOUT_MS,
  );

  it(
    'counts a wrong password or code when regenerating backup codes, and locks that too',
    async () => {
      const email = freshEmail();
      await createOperator(email);
      const session = await enroll(email);
      const headers = { cookie: session.cookie, 'x-csrf-token': session.csrfToken };
      const route = '/auth/operator/backup-codes/regenerate';
      const wrongPassword = await post(
        route,
        { password: 'wrong-password1', code: await generate({ secret: session.secret }) },
        headers,
      );
      expect(wrongPassword.status).toBe(401);
      const wrongCode = await post(
        route,
        { password: PASSWORD, code: 'not-a-real-backup' },
        headers,
      );
      expect(wrongCode.status).toBe(401);
      expect(wrongCode.body).toMatchObject({ error: { details: { attemptsLeft: 3 } } });
      await admin.query(
        `INSERT INTO control.sign_in_failures (operator_id)
         SELECT id FROM control.operator_accounts, generate_series(1, 3) WHERE email = $1`,
        [email],
      );
      const locked = await post(
        route,
        { password: PASSWORD, code: await generate({ secret: session.secret }) },
        headers,
      );
      expect(locked.status).toBe(429);
    },
    LIMIT_TIMEOUT_MS,
  );

  it(
    "locks one operator only, and a seller's failures never count",
    async () => {
      const locked = freshEmail();
      const other = freshEmail();
      await createOperator(locked);
      await createOperator(other);
      await admin.query(
        `INSERT INTO control.sign_in_failures (operator_id)
         SELECT id FROM control.operator_accounts, generate_series(1, 5) WHERE email = $1`,
        [locked],
      );
      expect(
        (await post('/auth/operator/signin', { email: locked, password: PASSWORD })).status,
      ).toBe(429);
      expect(
        (await post('/auth/operator/signin', { email: other, password: PASSWORD })).status,
      ).toBe(200);
    },
    LIMIT_TIMEOUT_MS,
  );
});

describeIfDatabase('who is signed in (GET /auth/operator/me)', () => {
  it(
    'says the email, the unused backup codes and when this session began',
    async () => {
      const email = freshEmail();
      await createOperator(email);
      const session = await enroll(email);
      const headers = {
        cookie: session.cookie,
        'x-csrf-token': session.csrfToken,
        'user-agent': 'Console test',
      };
      const me = await getJson(port, '/auth/operator/me', headers);
      expect(me.status).toBe(200);
      expect(me.body).toMatchObject({ email, unusedBackupCodes: 10 });
      expect(new Date((me.body as { signedInAt: string }).signedInAt).getTime()).toBeGreaterThan(
        Date.now() - 60_000,
      );

      // Using a backup code leaves nine.
      const used = await post('/auth/operator/verify', {
        email,
        password: PASSWORD,
        code: session.backupCodes[0],
      });
      expect(used.status).toBe(200);
      const after = await getJson(port, '/auth/operator/me', headers);
      expect(after.body).toMatchObject({ unusedBackupCodes: 9 });
    },
    BCRYPT_TIMEOUT_MS * 2,
  );

  it('needs an operator session', async () => {
    expect((await getJson(port, '/auth/operator/me', {})).status).toBe(401);
  });
});
