import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { countSmsParts } from '../src/modules/shared/messaging/sms-parts';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { SmsCapture } from './support/sms-capture';
import { cookieFrom, getJson, postJson } from './support/http';

// AUTH-21: the tenant's essential-SMS allowance usage, over real HTTP and the real database. A sign-up
// code (no shop yet) and the shop-ready SMS are both platform cost; a sign-in code to an already-existing
// shop is the owner's own choice (they have a password) and counts. Runs only when DATABASE_TEST_ADMIN_URL
// is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_essential_sms_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  postJson(port, path, payload, headers);
const get = (path: string, headers: Record<string, string> = {}) => getJson(port, path, headers);

const freshSlug = (): string => `s${randomUUID().replace(/-/g, '').slice(0, 10)}`;

/** AUTH-07's own 60-second resend cooldown is per (destination, channel, kind) regardless of whether the
 * latest challenge was ever consumed -- this test needs a second real code on the same phone right away. */
async function passCooldown(phone: string): Promise<void> {
  await admin.query(
    "UPDATE control.verification_challenges SET created_at = now() - interval '5 minutes' WHERE destination = $1",
    [phone],
  );
}

interface Owner {
  phone: string;
  slug: string;
  cookie: string;
  csrfToken: string;
}

/** Signs up a brand-new phone and creates its shop -- the shop-ready SMS fires during this, platform cost. */
async function owner(): Promise<Owner> {
  const phone = texts.freshPhone();
  const slug = freshSlug();
  await post('/auth/phone/code', { phone });
  const entered = await post('/auth/phone/verify', { phone, code: texts.codeFor(phone) });
  const session = {
    cookie: cookieFrom(entered),
    csrfToken: (entered.body as { csrfToken: string }).csrfToken,
  };
  const shop = await post(
    '/shops',
    { ownerName: 'Owner', shopName: `Shop ${slug}`, address: slug },
    { cookie: session.cookie, 'x-csrf-token': session.csrfToken },
  );
  expect(shop.status).toBe(201);
  return { phone, slug, ...session };
}

function shopCall(who: Owner): { cookie: string; 'x-csrf-token': string; host: string } {
  return { cookie: who.cookie, 'x-csrf-token': who.csrfToken, host: `${who.slug}.localhost` };
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'essential-sms-e2e-otp-secret-0123456789ab';
  process.env['PLATFORM_DOMAIN'] = 'localhost';

  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

describeIfDatabase('AUTH-21: essential-SMS allowance', () => {
  it('a sign-up code and the shop-ready SMS are both platform cost -- neither counts', async () => {
    const who = await owner();
    const usage = await get('/balance/essential-sms', shopCall(who));
    expect(usage.status).toBe(200);
    expect(usage.body).toMatchObject({ monthlyUsed: 0, totalUsed: 0 });
  });

  it('the request-code response never differs by account state (AUTH-13/P1-E10), but verify reveals the suggestion', async () => {
    const who = await owner();
    await passCooldown(who.phone);

    const codeResponse = await post('/auth/phone/code', { phone: who.phone });
    expect(codeResponse.status).toBe(200);
    expect(codeResponse.body).toEqual({ expiresInSeconds: 300, resendAfterSeconds: 60 });

    const verifyResponse = await post('/auth/phone/verify', {
      phone: who.phone,
      code: texts.codeFor(who.phone),
    });
    expect(verifyResponse.status).toBe(200);
    expect((verifyResponse.body as { suggestPassword: boolean }).suggestPassword).toBe(true);

    const expectedParts = countSmsParts(texts.sent.at(-1)?.body ?? '').parts;
    const usage = await get('/balance/essential-sms', shopCall(who));
    expect(usage.body).toMatchObject({ monthlyUsed: expectedParts, totalUsed: expectedParts });

    // A second sign-in code adds to the same running total, it doesn't replace it.
    await passCooldown(who.phone);
    await post('/auth/phone/code', { phone: who.phone });
    const after = await get('/balance/essential-sms', shopCall(who));
    expect(after.body).toMatchObject({
      monthlyUsed: expectedParts * 2,
      totalUsed: expectedParts * 2,
    });
  });

  it("one shop's sign-in codes never raise another shop's usage", async () => {
    const first = await owner();
    const second = await owner();
    await passCooldown(first.phone);
    await post('/auth/phone/code', { phone: first.phone });

    const firstUsage = await get('/balance/essential-sms', shopCall(first));
    const secondUsage = await get('/balance/essential-sms', shopCall(second));
    expect((firstUsage.body as { totalUsed: number }).totalUsed).toBeGreaterThan(0);
    expect(secondUsage.body).toMatchObject({ monthlyUsed: 0, totalUsed: 0 });
  });
});
