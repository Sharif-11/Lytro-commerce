import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { prepareTestDatabase } from './support/database';
import { cookieFrom, type HttpResult, postJson } from './support/http';

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
  app = moduleRef.createNestApplication();
  await app.listen(0, '127.0.0.1');
  port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
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
