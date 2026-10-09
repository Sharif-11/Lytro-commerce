import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OauthProvider } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import type { OauthProfile, OauthProviderPort } from '../src/modules/identity/ports/oauth-provider';
import {
  FACEBOOK_PROVIDER,
  GOOGLE_PROVIDER,
  OAUTH_PROVIDERS,
} from '../src/modules/identity/tokens';
import { MAIL_PROVIDER } from '../src/modules/shared/mail/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { prepareTestDatabase } from './support/database';
import { cookieFrom, getJson, postJson, type HttpResult } from './support/http';
import { MailCapture } from './support/mail-capture';
import { SmsCapture } from './support/sms-capture';

// Google and Facebook sign-in against fake providers, over real HTTP and the real database (AUTH-24, AUTH-27).
// The real providers are not called: their registration is a separate step. Runs only with DATABASE_TEST_ADMIN_URL.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_oauth_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

// A fake provider: the code it receives names the account, and "noemail" in the code means Facebook shares no email.
class FakeProvider implements OauthProviderPort {
  constructor(readonly provider: OauthProvider) {}

  authorizeUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string {
    return `https://fake.example/${this.provider}?state=${input.state}&challenge=${input.codeChallenge}`;
  }

  exchange(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<OauthProfile> {
    const accountId = input.code.replace(/^(ok|noemail)-/, '');
    return Promise.resolve({
      accountId: `${this.provider}-${accountId}`,
      email: input.code.startsWith('noemail-') ? null : `${accountId}@example.com`,
      emailVerified: true,
    });
  }
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
const mail = new MailCapture();
const sms = new SmsCapture();

const get = (path: string): Promise<HttpResult> => getJson(port, path);
const callback = (provider: string, code: string, state: string): Promise<HttpResult> =>
  getJson(port, `/auth/oauth/${provider}/callback?code=${encodeURIComponent(code)}&state=${state}`);

async function startFlow(provider: string): Promise<string> {
  const started = await get(`/auth/oauth/${provider}/start`);
  expect(started.status).toBe(200);
  const url = new URL((started.body as { url: string }).url);
  return url.searchParams.get('state') ?? '';
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'oauth-e2e-otp-secret-0123456789abcdef0';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GOOGLE_PROVIDER)
    .useValue(new FakeProvider(OauthProvider.Google))
    .overrideProvider(FACEBOOK_PROVIDER)
    .useValue(new FakeProvider(OauthProvider.Facebook))
    .overrideProvider(OAUTH_PROVIDERS)
    .useFactory({
      factory: (google: OauthProviderPort, facebook: OauthProviderPort) => [google, facebook],
      inject: [GOOGLE_PROVIDER, FACEBOOK_PROVIDER],
    })
    .overrideProvider(MAIL_PROVIDER)
    .useValue(mail.provider)
    .overrideProvider(SMS_PROVIDER)
    .useValue(sms.provider)
    .compile();
  app = moduleRef.createNestApplication();
  await app.listen(0, '127.0.0.1');
  port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

describeIfDatabase('Google and Facebook sign-in (AUTH-24, AUTH-27)', () => {
  it('lists the enabled providers', async () => {
    const response = await get('/auth/providers');
    expect(response.body).toEqual({ providers: ['google', 'facebook'] });
  });

  it('refuses an unknown provider', async () => {
    expect((await get('/auth/oauth/twitter/start')).status).toBe(404);
  });

  it('signs a new Google account in with no password, and sends it to create-shop', async () => {
    const state = await startFlow('google');
    const response = await callback('google', 'ok-alice', state);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ next: 'create-shop', recovery: null });
    expect(response.headers['set-cookie']).toBeDefined();

    const account = await admin.query<{ password_hash: string | null }>(
      `SELECT s.password_hash FROM control.subscribers s
       JOIN control.subscriber_identities i ON i.subscriber_id = s.id
       WHERE i.kind = 'google' AND i.value = $1`,
      ['google-alice'],
    );
    expect(account.rows[0]?.password_hash).toBeNull();
  });

  it('signs the same Google account back into the same subscriber', async () => {
    const state = await startFlow('google');
    const response = await callback('google', 'ok-alice', state);
    expect(response.status).toBe(200);
    const accounts = await admin.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM control.subscriber_identities WHERE kind = 'google' AND value = $1",
      ['google-alice'],
    );
    expect(accounts.rows[0]?.n).toBe(1);
  });

  it('refuses a replayed state, and a state it never issued', async () => {
    const state = await startFlow('google');
    expect((await callback('google', 'ok-bob', state)).status).toBe(200);
    expect((await callback('google', 'ok-bob', state)).status).toBe(400);
    expect((await callback('google', 'ok-bob', 'never-issued-state')).status).toBe(400);
  });

  it('refuses a state started with one provider and returned to another', async () => {
    const state = await startFlow('google');
    expect((await callback('facebook', 'ok-carol', state)).status).toBe(400);
  });

  it('tells a Facebook account with no email that Facebook is its only way back in (AUTH-27)', async () => {
    const state = await startFlow('facebook');
    const response = await callback('facebook', 'noemail-dave', state);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ next: 'create-shop', recovery: 'facebook-only' });
  });

  it('does not repeat the Facebook-only notice on a later sign-in', async () => {
    const state = await startFlow('facebook');
    const response = await callback('facebook', 'noemail-dave', state);
    expect(response.body).toMatchObject({ recovery: null });
  });

  it('does not send a code by mail for an OAuth sign-in', async () => {
    const before = mail.sent.length;
    const state = await startFlow('google');
    await callback('google', 'ok-erin', state);
    expect(mail.sent.length).toBe(before);
    expect((await postJson(port, '/auth/email/code', { email: 'erin@example.com' })).status).toBe(
      200,
    );
  });

  // Regression: a Google-only account has neither a phone nor an email identity (only a google-kind row),
  // and create-shop used to require one of those specifically, failing with a misleading "sign in to
  // continue" instead of creating the shop.
  it('creates a shop for an account that signed up through Google only, with no phone or email', async () => {
    const state = await startFlow('google');
    const signed = await callback('google', 'ok-shopowner', state);
    const cookie = cookieFrom(signed);
    const csrfToken = (signed.body as { csrfToken: string }).csrfToken;

    const response = await postJson(
      port,
      '/shops',
      { ownerName: 'Shop Owner', shopName: 'OAuth Shop' },
      { cookie, 'x-csrf-token': csrfToken },
    );

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ next: 'set-password' });
  });
});

describeIfDatabase('adding Google to a signed-in account (AUTH-26)', () => {
  it('attaches a Google account to the signed-in account through the provider flow', async () => {
    const email = `attach.${Math.random().toString(36).slice(2, 10)}@example.com`;
    await postJson(port, '/auth/email/code', { email });
    const signed = await postJson(port, '/auth/email/verify', { email, code: mail.codeFor(email) });
    const cookie = cookieFrom(signed);
    const csrfToken = (signed.body as { csrfToken: string }).csrfToken;

    const started = await postJson(
      port,
      '/me/identities/oauth/google/start',
      {},
      { host: 'localhost', cookie, 'x-csrf-token': csrfToken },
    );
    expect(started.status).toBe(200);
    const state = new URL((started.body as { url: string }).url).searchParams.get('state') ?? '';

    const attached = await getJson(port, `/auth/oauth/google/callback?code=ok-zed&state=${state}`);
    expect(attached.body).toEqual({ attached: 'google' });

    const listed = await getJson(port, '/me/identities', { host: 'localhost', cookie });
    expect(
      (listed.body as { identities: { kind: string }[] }).identities.map((i) => i.kind).sort(),
    ).toEqual(['email', 'google']);
  });
});
