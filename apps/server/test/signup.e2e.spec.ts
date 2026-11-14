import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformSettingKey } from '@lytronix/validators';
import type * as Validators from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { PlatformSettingsService } from '../src/modules/platform-settings/services/platform-settings.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { openShop } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';
import { cookieFrom, type HttpResult, postJson } from './support/http';

// LEG-01 (Slice 9.8): a version may be set only once its text is published. This file publishes a later terms version of
// its own, to see a new account record it.
vi.mock('@lytronix/validators', async (importOriginal) => {
  const actual = await importOriginal<typeof Validators>();
  return {
    ...actual,
    isPublishedTermsVersion: (value: unknown): boolean =>
      actual.isPublishedTermsVersion(value) || value === '2027-01-15',
  };
});

// Sign-up by phone over real HTTP and the real database (P1-E01 to P1-E04, AUTH-05 to AUTH-11, AUTH-28, TRL-01).
// Runs only when DATABASE_TEST_ADMIN_URL is set, which CI always does.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_signup_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

interface Entered {
  cookie: string;
  csrfToken: string;
  next: string;
  tenantId: string | null;
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  postJson(port, path, payload, headers);

const wrong = (code: string): string => (code === '000000' ? '111111' : '000000');

/** Requests a code, reads it from the provider log and verifies it. Returns the session the reply opens. */
async function enter(phone: string): Promise<Entered> {
  await post('/auth/phone/code', { phone });
  const response = await post('/auth/phone/verify', { phone, code: texts.codeFor(phone) });
  expect(response.status).toBe(200);
  const body = response.body as { next: string; tenantId: string | null; csrfToken: string };
  return { cookie: cookieFrom(response), ...body };
}

function createShop(entered: Entered, payload: Record<string, unknown>): Promise<HttpResult> {
  return post('/shops', payload, { cookie: entered.cookie, 'x-csrf-token': entered.csrfToken });
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'signup-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

// Every request comes from 127.0.0.1, so failures from one test must not lock the next (AUTH-14).
beforeEach(async () => {
  if (!ADMIN_URL) return;
  await admin.query('DELETE FROM control.sign_in_failures');
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

describeIfDatabase('sign-up by phone, end to end', () => {
  it('sends a six-digit code to a valid number (AUTH-05)', async () => {
    const phone = texts.freshPhone();
    const response = await post('/auth/phone/code', { phone });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ expiresInSeconds: 300, resendAfterSeconds: 60 });
    expect(texts.codeFor(phone)).toMatch(/^\d{6}$/);
  });

  it('refuses a resend within 60 seconds, with a Retry-After header (AUTH-07)', async () => {
    const phone = texts.freshPhone();
    await post('/auth/phone/code', { phone });
    const response = await post('/auth/phone/code', { phone });
    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBeDefined();
    expect(response.body).toMatchObject({ error: { code: 'rate_limited' } });
  });

  it('refuses a number that is not Bangladeshi, with the field named (AUTH-02)', async () => {
    const response = await post('/auth/phone/code', { phone: '+14155550100' });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: 'validation_error',
        details: { fields: [{ field: 'phone', problem: 'invalid_format' }] },
      },
    });
  });

  it('verifies a new number into a session that goes to create-shop, as an HttpOnly cookie (AUTH-12, D1)', async () => {
    const phone = texts.freshPhone();
    await post('/auth/phone/code', { phone });
    const response = await post('/auth/phone/verify', { phone, code: texts.codeFor(phone) });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ next: 'create-shop', tenantId: null });
    expect(response.body).toHaveProperty('csrfToken');
    const setCookie = String(response.headers['set-cookie']);
    expect(setCookie).toContain('lytronix_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
  });

  it('creates a trial shop from the session, and texts the live address (AUTH-10, AUTH-28, TRL-01)', async () => {
    const phone = texts.freshPhone();
    const entered = await enter(phone);
    const response = await createShop(entered, {
      ownerName: 'Rahim',
      shopName: 'Fashion House',
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      address: 'fashion-house',
      shopUrl: 'http://fashion-house.localhost',
      next: 'set-password',
    });

    const shop = await admin.query<{ state: string; plan: string }>(
      `SELECT t.state::text AS state, p.name AS plan
       FROM control.tenants t JOIN control.plans p ON p.id = t.plan_id
       WHERE t.slug = 'fashion-house'`,
    );
    expect(shop.rows[0]).toEqual({ state: 'trial', plan: 'Trial' });

    const sms = await admin.query<{ body: string }>(
      "SELECT body FROM control.sms_outbox WHERE to_phone = $1 AND kind = 'shop_ready'",
      [phone],
    );
    expect(sms.rows).toHaveLength(1);
    // SMS-18 (amended 2026-11-12): the owner's words, with the shop's name and its dashboard's address, sent through the
    // real path to the provider -- 86 characters here, two units.
    const words =
      'আপনার শপ Fashion House তৈরি হয়েছে। শপ চালান এখানে: http://app.localhost/fashion-house';
    expect(sms.rows[0]?.body).toBe(words);
    expect(texts.sent.filter((text) => text.toPhone === phone).map((text) => text.body)).toContain(
      words,
    );
    expect(Array.from(words)).toHaveLength(86);

    // Skipping the set-password offer (P1-E01) leaves the account exactly as code sign-up made it: no password.
    const account = await admin.query<{ password_hash: string | null }>(
      'SELECT s.password_hash FROM control.subscribers s JOIN control.subscriber_identities i ON i.subscriber_id = s.id WHERE i.value = $1',
      [phone],
    );
    expect(account.rows[0]?.password_hash).toBeNull();
  });

  it('routes a returning number with a shop to the dashboard, refuses a second shop, and texts no second shop-ready SMS (AUTH-08, TEN-15, SMS-18)', async () => {
    const phone = texts.freshPhone();
    const first = await enter(phone);
    await createShop(first, { ownerName: 'Karim', shopName: 'First Shop' });

    await admin.query(
      "UPDATE control.verification_challenges SET created_at = now() - interval '2 minutes' WHERE destination = $1",
      [phone],
    );
    const returning = await enter(phone);
    // next: 'dashboard', not 'set-password' — the one-time offer right after shop creation is never repeated
    // on a later sign-in (P1-E33), since create-shop itself can only run once per subscriber (AUTH-08 below).
    expect(returning).toMatchObject({ next: 'dashboard' });
    expect(returning.tenantId).not.toBeNull();

    const response = await createShop(returning, { ownerName: 'Karim', shopName: 'Second Shop' });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: { code: 'conflict', message: 'এই অ্যাকাউন্টের শপ আগে থেকেই আছে।', details: {} },
    });

    // SMS-18: signing in again, and a second shop refused, send no further shop-ready SMS -- one, from the shop's creation.
    const ready = await admin.query<{ n: string }>(
      "SELECT count(*) AS n FROM control.sms_outbox WHERE to_phone = $1 AND kind = 'shop_ready'",
      [phone],
    );
    expect(Number(ready.rows[0]?.n)).toBe(1);
  });

  it('suggests the next free address when the name is taken (AUTH-11)', async () => {
    // "fashion-house" is held by the earlier test, so the same name gets a suffix.
    const entered = await enter(texts.freshPhone());
    const response = await createShop(entered, { ownerName: 'Amina', shopName: 'Fashion House' });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ address: 'fashion-house-2' });
  });

  it('refuses a typed address that is taken, and offers the next free one', async () => {
    const entered = await enter(texts.freshPhone());
    const response = await createShop(entered, {
      ownerName: 'Amina',
      shopName: 'Other Name',
      address: 'fashion-house',
    });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: {
        code: 'conflict',
        message: 'এই লিংকটি আগে থেকেই নেওয়া আছে। fashion-house-3 চেষ্টা করুন।',
        details: {
          suggestion: 'fashion-house-3',
          fields: [{ field: 'address', problem: 'taken' }],
        },
      },
    });
  });

  it('refuses shop creation without a session, and without the CSRF token (SEC-14)', async () => {
    const none = await post('/shops', { ownerName: 'Anon', shopName: 'Anon Shop' });
    expect(none.status).toBe(401);
    expect(none.body).toMatchObject({ error: { code: 'unauthenticated' } });

    const entered = await enter(texts.freshPhone());
    const noCsrf = await post(
      '/shops',
      { ownerName: 'Anon', shopName: 'Anon Shop' },
      { cookie: entered.cookie },
    );
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body).toMatchObject({ error: { code: 'forbidden' } });

    // Slice 9.7: a token is its own session's, so another session's real token is refused too.
    const other = await enter(texts.freshPhone());
    const borrowed = await post(
      '/shops',
      { ownerName: 'Anon', shopName: 'Anon Shop' },
      { cookie: entered.cookie, 'x-csrf-token': other.csrfToken },
    );
    expect(borrowed.status).toBe(403);
    expect(borrowed.body).toMatchObject({ error: { code: 'forbidden' } });
  });

  it('locks the code after five wrong codes, even when the sixth is correct (AUTH-06)', async () => {
    const phone = texts.freshPhone();
    await post('/auth/phone/code', { phone });
    const correct = texts.codeFor(phone);

    const verifyWith = (code: string) => post('/auth/phone/verify', { phone, code });
    for (let i = 0; i < 4; i += 1) {
      const response = await verifyWith(wrong(correct));
      expect(response.status).toBe(400);
    }
    const fifth = await verifyWith(wrong(correct));
    expect(fifth.status).toBe(429);

    const sixth = await verifyWith(correct);
    expect(sixth.status).toBe(429);

    const newCode = await post('/auth/phone/code', { phone });
    expect(newCode.status).toBe(429);
  });

  it('answers a malformed verify body with the fields named, not a crash', async () => {
    const response = await post('/auth/phone/verify', { phone: texts.freshPhone(), code: 'abc' });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        code: 'validation_error',
        message: '6 সংখ্যার কোডটি দিন।',
        details: { fields: [{ field: 'code', problem: 'invalid_format' }] },
      },
    });
  });
});

describeIfDatabase('what an account accepted (LEG-01)', () => {
  const FIRST = '2026-11-20';
  const LATER = '2027-01-15';

  async function acceptedBy(phone: string) {
    const { rows } = await admin.query<{
      terms_version: string | null;
      privacy_version: string | null;
      terms_accepted_at: Date | null;
      id: string;
    }>(
      `SELECT s.id, s.terms_version, s.privacy_version, s.terms_accepted_at FROM control.subscribers s
       JOIN control.subscriber_identities i ON i.subscriber_id = s.id
       WHERE i.kind = 'phone' AND i.value = $1`,
      [phone],
    );
    const row = rows[0];
    if (!row) throw new Error(`no account for ${phone}`);
    return row;
  }

  /** New terms published, for the length of a check; only the terms, so the two are seen to be apart. */
  async function withNewTerms(check: () => Promise<void>): Promise<void> {
    const settings = app.get(PlatformSettingsService);
    await settings.set(PlatformSettingKey.TermsVersion, LATER, randomUUID());
    try {
      await check();
    } finally {
      await settings.set(PlatformSettingKey.TermsVersion, FIRST, randomUUID());
    }
  }

  it('records both versions and the time when the account is made', async () => {
    const before = Date.now();
    const phone = texts.freshPhone();
    await enter(phone);
    const account = await acceptedBy(phone);
    expect(account).toMatchObject({ terms_version: FIRST, privacy_version: FIRST });
    const at = account.terms_accepted_at?.getTime() ?? 0;
    expect(at).toBeGreaterThanOrEqual(before - 1000);
    expect(at).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('records the version in force for a new account, and leaves an older one what it accepted', async () => {
    const older = texts.freshPhone();
    const session = await enter(older);
    const was = await acceptedBy(older);
    await withNewTerms(async () => {
      const newer = texts.freshPhone();
      await enter(newer);
      expect(await acceptedBy(newer)).toMatchObject({
        terms_version: LATER,
        privacy_version: FIRST,
      });
      // Opening a shop accepts nothing new for an account with a record: re-accepting isn't built.
      const shop = await createShop(session, { ownerName: 'Rahim', shopName: 'Old Terms House' });
      expect(shop.status, JSON.stringify(shop.body)).toBe(201);
      expect(await acceptedBy(older)).toEqual(was);
    });
  });

  it('leaves staff an owner adds with nothing, until they open a shop of their own', async () => {
    const shop = await openShop(port, texts, 'terms');
    await admin.query(
      "UPDATE control.tenants SET plan_id = (SELECT id FROM control.plans WHERE name = 'Starter'), plan_snapshot = (SELECT limits FROM control.plans WHERE name = 'Starter') WHERE id = $1",
      [shop.tenantId],
    );
    const role = await shop.post('/roles', { name: 'Packer', permissions: ['orders:read'] });
    expect(role.status, JSON.stringify(role.body)).toBe(201);
    const phone = texts.freshPhone();
    const added = await shop.post('/staff', {
      phone,
      password: 'staff-pass-1',
      roleIds: [(role.body as { id: string }).id],
    });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    expect(await acceptedBy(phone)).toMatchObject({
      terms_version: null,
      privacy_version: null,
      terms_accepted_at: null,
    });

    // They reach the entry screen, with its line, on the way to a shop of their own.
    const entered = await enter(phone);
    const own = await createShop(entered, { ownerName: 'Karim', shopName: 'Their Own House' });
    expect(own.status, JSON.stringify(own.body)).toBe(201);
    const account = await acceptedBy(phone);
    expect(account).toMatchObject({ terms_version: FIRST, privacy_version: FIRST });
    expect(account.terms_accepted_at).not.toBeNull();
  });

  it('refuses to make an account it cannot record, rather than record nothing', async () => {
    const settings = app.get(PlatformSettingsService);
    const real = settings.current.bind(settings);
    const missing = vi
      .spyOn(settings, 'current')
      .mockImplementation((key) =>
        key === PlatformSettingKey.PrivacyVersion ? Promise.resolve(null) : real(key),
      );
    try {
      const phone = texts.freshPhone();
      await post('/auth/phone/code', { phone });
      const refused = await post('/auth/phone/verify', { phone, code: texts.codeFor(phone) });
      expect(refused.status).toBe(500);
      const { rows } = await admin.query(
        "SELECT 1 FROM control.subscriber_identities WHERE kind = 'phone' AND value = $1",
        [phone],
      );
      expect(rows).toEqual([]);
    } finally {
      missing.mockRestore();
    }
  });
});

describeIfDatabase('an SMS outage does not block sign-up (SMS-18)', () => {
  it('creates the shop and keeps the ready message for retry', async () => {
    const phone = texts.freshPhone();
    const entered = await enter(phone);

    texts.down = true;
    let response: HttpResult;
    try {
      response = await createShop(entered, { ownerName: 'Outage', shopName: 'Outage Shop' });
    } finally {
      texts.down = false;
    }

    expect(response.status).toBe(201);
    const row = await admin.query<{ status: string; attempts: number }>(
      "SELECT status, attempts FROM control.sms_outbox WHERE to_phone = $1 AND kind = 'shop_ready'",
      [phone],
    );
    expect(row.rows[0]).toEqual({ status: 'pending', attempts: 1 });
  });
});

describeIfDatabase('an SMS outage on a code request is reported honestly (AUTH-05)', () => {
  it('answers 503 service_unavailable with a retry hint, and never claims a code was sent', async () => {
    const phone = texts.freshPhone();
    texts.down = true;
    let response: HttpResult;
    try {
      response = await post('/auth/phone/code', { phone });
    } finally {
      texts.down = false;
    }

    expect(response.status).toBe(503);
    expect(response.headers['retry-after']).toBe('60');
    expect(response.body).toMatchObject({ error: { code: 'service_unavailable' } });
    const row = await admin.query<{ status: string; body: string | null }>(
      "SELECT status, body FROM control.sms_outbox WHERE to_phone = $1 AND kind = 'otp'",
      [phone],
    );
    expect(row.rows[0]).toEqual({ status: 'failed', body: null });
  });
});
