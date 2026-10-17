import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { SmsCapture } from './support/sms-capture';
import { cookieFrom, postJson, type HttpResult } from './support/http';

// AUTH-09: free-trial creation is capped per verified identity and per client IP, each over a rolling
// window. The real SRS values (1 per identity, 1 per IP) would make the per-IP case untestable alongside
// the per-identity case in one process (every call here shares one loopback IP), so this file raises
// TRIAL_LIMIT_PER_IP just enough to leave room for both scenarios in one sequential test -- same reasoning
// signup-rate-limit.e2e.spec.ts already uses for the sibling SUP-08 limiter. Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_trial_limit_test';
const IP_CAP = 2;
const IDENTITY_CAP = 1;
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
  postJson(port, path, payload, headers);

interface Session {
  cookie: string;
  csrfToken: string;
}

function errorOf(result: HttpResult): unknown {
  return (result.body as { error?: unknown }).error;
}

/** Signs a fresh phone up, but never creates a shop. */
async function signUp(phone: string): Promise<Session> {
  await post('/auth/phone/code', { phone });
  const entered = await post('/auth/phone/verify', { phone, code: texts.codeFor(phone) });
  return {
    cookie: cookieFrom(entered),
    csrfToken: (entered.body as { csrfToken: string }).csrfToken,
  };
}

async function createShop(session: Session, shopName: string): Promise<HttpResult> {
  const headers = { cookie: session.cookie, 'x-csrf-token': session.csrfToken };
  return post(
    '/shops',
    { ownerName: 'Owner', shopName, address: `shop-${randomUUID().slice(0, 8)}` },
    headers,
  );
}

async function identityIdOf(phone: string): Promise<string> {
  const row = await admin.query<{ id: string }>(
    "SELECT id FROM control.subscriber_identities WHERE kind = 'phone' AND value = $1",
    [phone],
  );
  const id = row.rows[0]?.id;
  if (!id) throw new Error(`no identity for phone ${phone}`);
  return id;
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'trial-limit-e2e-otp-secret-0123456789abcdefgh';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['TRIAL_LIMIT_PER_IP'] = String(IP_CAP);
  process.env['TRIAL_LIMIT_PER_IDENTITY'] = String(IDENTITY_CAP);

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
  delete process.env['TRIAL_LIMIT_PER_IP'];
  delete process.env['TRIAL_LIMIT_PER_IDENTITY'];
});

describeIfDatabase('free-trial creation is capped per identity and per IP (AUTH-09)', () => {
  it('refuses a trial once the identity has one already, and once the IP has reached its cap', async () => {
    // Per-identity: this identity's own first-ever API call, but a trial_creations row already exists for
    // it (simulating a prior trial, e.g. one whose tenant was later deleted) -- seeded from a different IP
    // so it never touches this process's own shared-IP count.
    const seededPhone = texts.freshPhone();
    const seededSession = await signUp(seededPhone);
    const seededIdentityId = await identityIdOf(seededPhone);
    await admin.query('INSERT INTO control.trial_creations (identity_id, ip) VALUES ($1, $2)', [
      seededIdentityId,
      '203.0.113.5',
    ]);
    const blockedByIdentity = await createShop(seededSession, 'Blocked By Identity');
    expect(blockedByIdentity.status).toBe(429);
    expect(errorOf(blockedByIdentity)).toMatchObject({ code: 'rate_limited' });

    // Two different, genuinely fresh identities each succeed once -- each is that identity's own first
    // trial (so the per-identity cap of 1 never trips for either), consuming the shared IP's two slots.
    const first = await signUp(texts.freshPhone());
    expect((await createShop(first, 'Shop One')).status).toBe(201);

    const second = await signUp(texts.freshPhone());
    expect((await createShop(second, 'Shop Two')).status).toBe(201);

    // Per-IP: a third, still-fresh identity -- its own cap is fine -- is refused because the shared IP has
    // now reached its cap of two.
    const third = await signUp(texts.freshPhone());
    const blockedByIp = await createShop(third, 'Blocked By IP');
    expect(blockedByIp.status).toBe(429);
    expect(errorOf(blockedByIp)).toMatchObject({ code: 'rate_limited' });

    // A refused attempt never got as far as recording -- the blocked identity's own count is still 1, not 2.
    const count = await admin.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM control.trial_creations WHERE identity_id = $1',
      [seededIdentityId],
    );
    expect(count.rows[0]?.n).toBe('1');
  });
});
