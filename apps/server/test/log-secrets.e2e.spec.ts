import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { prepareTestDatabase } from './support/database';
import { SmsCapture } from './support/sms-capture';
import { cookieFrom, postJson } from './support/http';

// P1-N02, LOG-02: nothing written to the process's own logs (stdout/stderr — everything NestJS's Logger and
// any console.error ultimately go through) ever contains a password, a raw OTP code or a session token,
// across a real sign-up and sign-in. A targeted capture, not every scenario in the plan — but the same
// mechanism would catch a leak from any of them, since it hooks the one place all server-side logging exits
// through, not a per-call-site check.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_log_secrets_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const PASSWORD = 'correct-horse-9';

let app: INestApplication;
let port: number;
const texts = new SmsCapture();

const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  postJson(port, path, payload, headers);

let captured = '';
let originalStdoutWrite: typeof process.stdout.write;
let originalStderrWrite: typeof process.stderr.write;

function startCapture(): void {
  captured = '';
  originalStdoutWrite = process.stdout.write.bind(process.stdout);
  originalStderrWrite = process.stderr.write.bind(process.stderr);
  const capture = (chunk: unknown): boolean => {
    captured += typeof chunk === 'string' ? chunk : String(chunk);
    return true;
  };
  process.stdout.write = capture;
  process.stderr.write = capture;
}

function stopCapture(): void {
  process.stdout.write = originalStdoutWrite;
  process.stderr.write = originalStderrWrite;
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'log-secrets-e2e-otp-secret-0123456789abcd';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  app = moduleRef.createNestApplication();
  await app.listen(0, '127.0.0.1');
  port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
});

beforeEach(startCapture);
afterEach(stopCapture);

describeIfDatabase('nothing secret ever reaches a log line (P1-N02, LOG-02)', () => {
  it('never logs the OTP code, the session cookie value or the password', async () => {
    const phone = texts.freshPhone();
    await post('/auth/phone/code', { phone });
    const code = texts.codeFor(phone);

    const verified = await post('/auth/phone/verify', { phone, code });
    expect(verified.status).toBe(200);
    const cookie = cookieFrom(verified);
    const rawToken = cookie.split('=')[1] ?? '';
    const csrfToken = (verified.body as { csrfToken: string }).csrfToken;

    const shop = await post(
      '/shops',
      { ownerName: 'Owner', shopName: 'Log Secrets Shop' },
      { cookie, 'x-csrf-token': csrfToken },
    );
    expect(shop.status).toBe(201);

    const setPassword = await post(
      '/auth/password',
      { newPassword: PASSWORD },
      { cookie, 'x-csrf-token': csrfToken },
    );
    expect(setPassword.status).toBe(200);

    // A wrong password too, since a failed attempt is exactly the kind of path that might accidentally log
    // the attempted credential for debugging.
    await post('/auth/signin', { phone, password: 'a-wrong-one-entirely' }, {});

    expect(captured).not.toContain(code);
    expect(captured).not.toContain(rawToken);
    expect(captured).not.toContain(csrfToken);
    expect(captured).not.toContain(PASSWORD);
    expect(captured).not.toContain('a-wrong-one-entirely');
  });
});
