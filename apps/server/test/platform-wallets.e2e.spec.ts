import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { SmsCapture } from './support/sms-capture';
import { passFirstSignIn } from './support/shop-client';
import {
  cookieFrom,
  deleteJson,
  getJson,
  patchJson,
  postJson,
  type HttpResult,
} from './support/http';

// The platform's own wallet numbers (BIL-02, BAL-03), over the real database and HTTP. Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_platform_wallets_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const BCRYPT_TIMEOUT_MS = 30_000;
const PASSWORD = 'correct-horse-9';
const STAFF_PASSWORD = 'staff-pass-2468';

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  postJson(port, path, payload, headers);
const get = (path: string, headers: Record<string, string> = {}) => getJson(port, path, headers);
const patch = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  patchJson(port, path, payload, headers);
const del = (path: string, headers: Record<string, string> = {}) => deleteJson(port, path, headers);

const freshSlug = (): string => `w${randomUUID().replace(/-/g, '').slice(0, 10)}`;

function errorOf(result: HttpResult): unknown {
  return (result.body as { error?: unknown }).error;
}

interface Owner {
  phone: string;
  slug: string;
  cookie: string;
  csrfToken: string;
}

async function owner(): Promise<Owner> {
  const phone = texts.freshPhone();
  const slug = freshSlug();
  await post('/auth/phone/code', { phone });
  const entered = await post('/auth/phone/verify', { phone, code: texts.codeFor(phone) });
  const session = {
    cookie: cookieFrom(entered),
    csrfToken: (entered.body as { csrfToken: string }).csrfToken,
  };
  const headers = { cookie: session.cookie, 'x-csrf-token': session.csrfToken };
  const shop = await post(
    '/shops',
    { ownerName: 'Owner', shopName: `Shop ${slug}`, address: slug },
    headers,
  );
  expect(shop.status).toBe(201);
  return { phone, slug, ...session };
}

function shopCall(who: Owner): Record<string, string> {
  return {
    cookie: who.cookie,
    'x-csrf-token': who.csrfToken,
    host: 'localhost',
    'x-lytro-shop': who.slug,
  };
}

async function moveToPlan(slug: string, planName: string): Promise<void> {
  await admin.query(
    `UPDATE control.tenants
       SET plan_id = (SELECT id FROM control.plans WHERE name = $1), plan_snapshot = (SELECT limits FROM control.plans WHERE name = $1)
     WHERE slug = $2`,
    [planName, slug],
  );
}

async function addStaffWithPassword(who: Owner, phone: string): Promise<HttpResult> {
  return post('/staff', { phone, password: STAFF_PASSWORD, name: 'Staff' }, shopCall(who));
}

async function staffSignIn(slug: string, phone: string): Promise<HttpResult> {
  const signedIn = await post(
    '/auth/staff/signin',
    { phone, password: STAFF_PASSWORD },
    { host: 'localhost', 'x-lytro-shop': slug },
  );
  await passFirstSignIn(port, signedIn, STAFF_PASSWORD, {
    host: 'localhost',
    'x-lytro-shop': slug,
  });
  return signedIn;
}

async function createOperator(email: string): Promise<void> {
  const passwordHash = await hash(PASSWORD, 12);
  await admin.query(
    'INSERT INTO control.operator_accounts (email, password_hash) VALUES ($1, $2)',
    [email, passwordHash],
  );
}

async function operatorHeaders(): Promise<Record<string, string>> {
  const email = `operator.${randomUUID().slice(0, 8)}@lytronix.internal`;
  await createOperator(email);
  const signedIn = await post('/auth/operator/signin', { email, password: PASSWORD });
  const { secret } = signedIn.body as { secret: string };
  const code = await generate({ secret });
  const response = await post('/auth/operator/enroll', { email, password: PASSWORD, code });
  const body = response.body as { csrfToken: string };
  return { cookie: cookieFrom(response), 'x-csrf-token': body.csrfToken };
}

interface WalletBody {
  id: string;
  provider: string;
  number: string;
  label: string | null;
  enabled: boolean;
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'platform-wallets-e2e-otp-secret-0123456789a';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
}, BCRYPT_TIMEOUT_MS);

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

describeIfDatabase('platform wallets (BIL-02, BAL-03)', () => {
  it(
    'lets an operator add, list, update and remove a wallet, each one audited',
    async () => {
      const headers = await operatorHeaders();

      const created = await post(
        '/operator/platform-wallets',
        { provider: 'bKash', number: '01711111111', label: 'Personal' },
        headers,
      );
      expect(created.status).toBe(201);
      const wallet = created.body as WalletBody;
      expect(wallet).toMatchObject({
        provider: 'bKash',
        number: '01711111111',
        label: 'Personal',
        enabled: true,
      });

      const disabled = await patch(
        `/operator/platform-wallets/${wallet.id}`,
        { enabled: false },
        headers,
      );
      expect(disabled.status).toBe(200);
      expect(disabled.body).toMatchObject({ enabled: false });

      // The operator's own screen sees a disabled wallet too (`enabledOnly: false`).
      const operatorList = await get('/operator/platform-wallets', headers);
      expect((operatorList.body as WalletBody[]).map((w) => w.id)).toContain(wallet.id);

      const removed = await del(`/operator/platform-wallets/${wallet.id}`, headers);
      expect(removed.status).toBe(200);

      const afterRemoval = await get('/operator/platform-wallets', headers);
      expect((afterRemoval.body as WalletBody[]).map((w) => w.id)).not.toContain(wallet.id);

      const audit = await admin.query<{ action: string }>(
        `SELECT action FROM control.platform_audit_log WHERE target_id = $1 ORDER BY id`,
        [wallet.id],
      );
      expect(audit.rows.map((r) => r.action)).toEqual([
        'platform_wallet_added',
        'platform_wallet_updated',
        'platform_wallet_removed',
      ]);
    },
    BCRYPT_TIMEOUT_MS,
  );

  it(
    'answers not_found when updating a wallet that does not exist',
    async () => {
      const headers = await operatorHeaders();
      const response = await patch(
        `/operator/platform-wallets/${randomUUID()}`,
        { enabled: false },
        headers,
      );
      expect(response.status).toBe(404);
      expect(errorOf(response)).toMatchObject({ code: 'not_found' });
    },
    BCRYPT_TIMEOUT_MS,
  );

  it('refuses the operator routes without an operator session', async () => {
    const response = await get('/operator/platform-wallets');
    expect(response.status).toBe(401);
  });

  it(
    'the tenant-facing route lists only enabled wallets, reachable with no specific permission',
    async () => {
      const headers = await operatorHeaders();
      const enabled = await post(
        '/operator/platform-wallets',
        { provider: 'Nagad', number: '01822222222' },
        headers,
      );
      expect(enabled.status).toBe(201);
      const disabled = await post(
        '/operator/platform-wallets',
        { provider: 'Rocket', number: '01933333333', enabled: false },
        headers,
      );
      expect(disabled.status).toBe(201);

      try {
        const who = await owner();
        await moveToPlan(who.slug, 'Starter');
        const phone = texts.freshPhone();
        // No roleIds given -- this staff member holds zero permissions, proving the route needs none.
        const added = await addStaffWithPassword(who, phone);
        expect(added.status).toBe(201);
        const signedIn = await staffSignIn(who.slug, phone);
        expect(signedIn.status).toBe(200);
        const cookie = cookieFrom(signedIn);

        const response = await get('/platform-wallets', {
          cookie,
          host: 'localhost',
          'x-lytro-shop': who.slug,
        });
        expect(response.status).toBe(200);
        const ids = (response.body as WalletBody[]).map((w) => w.id);
        expect(ids).toContain((enabled.body as WalletBody).id);
        expect(ids).not.toContain((disabled.body as WalletBody).id);
      } finally {
        await admin.query('DELETE FROM control.platform_wallets WHERE id = ANY($1)', [
          [(enabled.body as WalletBody).id, (disabled.body as WalletBody).id],
        ]);
      }
    },
    BCRYPT_TIMEOUT_MS,
  );

  it('refuses the tenant-facing route without a session', async () => {
    const response = await get('/platform-wallets', { host: 'localhost' });
    expect(response.status).toBe(401);
  });
});
