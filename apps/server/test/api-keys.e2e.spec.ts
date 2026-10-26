import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { PlatformSettingKey, UsageMetric } from '@lytronix/validators';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { ClientIp } from '../src/common/client-ip';
import { dhakaDate } from '../src/common/time';
import { headerValue, type HttpRequest } from '../src/common/http';
import type { MessageKey } from '../src/common/i18n/message-key';
import { translate } from '../src/common/i18n/messages';
import { PublicApiEraser } from '../src/modules/public-api/services/public-api-eraser';
import { RequestQuota } from '../src/modules/public-api/services/request-quota';
import { API_CLOCK } from '../src/modules/public-api/tokens';
import { PlanLimitOverridesService } from '../src/modules/billing/services/plan-limit-overrides.service';
import { PlatformSettingsService } from '../src/modules/platform-settings/services/platform-settings.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { USAGE_NOTICES } from '../src/modules/usage-warnings/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { getJson, sendExact, type HttpResult } from './support/http';
import { errorOf, fieldsOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';
import { UsageNoticeCapture } from './support/usage-notice-capture';

// Phase 3 Slice 8: public API keys made and revoked from the dashboard, and the public API host's gate -- the key,
// its website addresses, CORS and preflight, the per-visitor limit (the operator's figure; a key has no per-minute
// limit of its own, KNOWN-GAPS §82) and the monthly quota, read from the shop's snapshot and overrides. API-01 to
// API-05, API-08, API-10, API-14, API-21, API-23, API-24; RTE-02 to RTE-07, RTE-10. Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_api_keys_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

/** Lets a test play several visitors: the address is the `x-test-visitor` header's, else the socket's. */
const visitorIp = {
  resolve(request: HttpRequest): string | null {
    return headerValue(request.headers['x-test-visitor']) ?? request.ip ?? null;
  },
  context(request: HttpRequest): { userAgent: string | null; ip: string | null } {
    return {
      userAgent: headerValue(request.headers['user-agent']) ?? null,
      ip: visitorIp.resolve(request),
    };
  },
};

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const notices = new UsageNoticeCapture();
// The limits' clock: the tests move it past a window instead of waiting a minute.
let clockOffsetMs = 0;

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'api-keys-e2e-otp-secret-0123456789abcdefghij';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(USAGE_NOTICES)
    .useValue(notices)
    .overrideProvider(API_CLOCK)
    .useValue(() => new Date(Date.now() + clockOffsetMs))
    .overrideProvider(ClientIp)
    .useValue(visitorIp)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

const SITE = 'https://myshop.com';
const API_HOST = 'api.localhost';

interface KeyView {
  id: string;
  name: string;
  type: string;
  prefix: string;
  websites: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  key?: string;
}

/** What the dashboard is told, in the default language (Bangla). */
function said(key: MessageKey): string {
  return translate(key, 'bn');
}

async function makeKey(
  shop: ShopClient,
  body: Record<string, unknown> = {},
): Promise<KeyView & { key: string }> {
  const made = await shop.post('/api-keys', { name: 'Website', websites: [SITE], ...body });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as KeyView & { key: string };
}

/** A call to the public API host, as a browser on `origin` would make it. */
function callApi(
  path: string,
  key: string | null,
  origin: string | null = SITE,
  extra: Record<string, string> = {},
): Promise<HttpResult> {
  return sendExact(port, 'GET', path, undefined, {
    host: API_HOST,
    ...(key !== null ? { authorization: `Bearer ${key}` } : {}),
    ...(origin !== null ? { origin } : {}),
    ...extra,
  });
}

function overrideLimit(tenantId: string, limitKey: string, value: number | null) {
  return app
    .get(PlanLimitOverridesService)
    .set(tenantId, limitKey, value, 'API limit test', randomUUID());
}

describeIfDatabase('public API keys in the dashboard (API-01, API-02, API-21)', () => {
  it('makes a key, shows its value once, keeps only its hash, and lists it by name and prefix', async () => {
    const shop = await openShop(port, texts, 'keys');
    const made = await makeKey(shop, {
      name: 'Main website',
      websites: ['https://MyShop.com/', SITE, 'http://localhost:3000'],
    });
    expect(made.key).toMatch(/^lytro_pk_[A-Za-z0-9]{32}$/);
    expect(made).toMatchObject({
      name: 'Main website',
      type: 'public',
      prefix: made.key.slice(0, 13),
      websites: [SITE, 'http://localhost:3000'],
      expiresAt: null,
      revokedAt: null,
    });

    const listed = (await shop.get('/api-keys')).body as KeyView[];
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty('key');
    const stored = await admin.query<{ key_hash: string; row: string }>(
      'SELECT key_hash, row_to_json(k)::text AS row FROM control.api_keys k WHERE id = $1',
      [made.id],
    );
    expect(stored.rows[0]?.key_hash).toBe(createHash('sha256').update(made.key).digest('hex'));
    expect(stored.rows[0]?.row).not.toContain(made.key);

    // API-21: in the activity log by name and prefix, never by value.
    const logged = await admin.query<{ action: string; summary: string }>(
      'SELECT action, summary::text FROM tenant.activity_log WHERE tenant_id = $1 AND target_id = $2',
      [shop.tenantId, made.id],
    );
    expect(logged.rows.map((row) => row.action)).toEqual(['api_key_created']);
    expect(logged.rows[0]?.summary).toContain(made.prefix);
    expect(logged.rows[0]?.summary).not.toContain(made.key);
  });

  it('refuses a website address that is not a bare https origin, and an expiry already past', async () => {
    const shop = await openShop(port, texts, 'key-sites');
    for (const website of ['http://myshop.com', 'https://myshop.com/shop', 'myshop.com']) {
      const refused = await shop.post('/api-keys', { name: 'Site', websites: [website] });
      expect(refused.status, website).toBe(400);
      expect(fieldsOf(refused)).toEqual({ 'websites.0': 'invalid_url' });
    }
    const past = await shop.post('/api-keys', {
      name: 'Site',
      websites: [SITE],
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(fieldsOf(past)).toEqual({ expiresAt: 'not_allowed' });
  });

  it('holds 20 live keys and refuses the 21st, until one is revoked', async () => {
    const shop = await openShop(port, texts, 'key-cap');
    const made: KeyView[] = [];
    for (let index = 0; index < 20; index += 1) {
      made.push(await makeKey(shop, { name: `Key ${String(index)}` }));
    }
    const refused = await shop.post('/api-keys', { name: 'One more', websites: [SITE] });
    expect(refused.status).toBe(402);
    expect(errorOf(refused).code).toBe('plan_limit_reached');
    await shop.post(`/api-keys/${made[0]?.id ?? ''}/revoke`, {});
    await makeKey(shop, { name: 'Replacement' });
    // Revoked keys stay in the list.
    expect(((await shop.get('/api-keys')).body as KeyView[]).length).toBe(21);
  });

  it("keeps a shop's keys its own: another shop can neither list, change nor revoke them (SEC-02)", async () => {
    const owner = await openShop(port, texts, 'key-own');
    const other = await openShop(port, texts, 'key-other');
    const made = await makeKey(owner);
    expect((await other.get('/api-keys')).body).toEqual([]);
    expect((await other.patch(`/api-keys/${made.id}`, { name: 'Taken' })).status).toBe(404);
    expect((await other.post(`/api-keys/${made.id}/revoke`, {})).status).toBe(404);
    // API-10: the key's shop answers, whatever shop the request names.
    const answer = await callApi('/v1/shop', made.key, SITE, { 'x-lytro-shop': other.slug });
    expect(answer.body).toEqual({
      name: `Shop ${owner.slug}`,
      slug: owner.slug,
      metaPixelId: null,
      brand: null,
    });
  });

  it('lets only a holder of keys:manage see or make keys', async () => {
    const shop = await openShop(port, texts, 'key-perm');
    const staff = await staffWith(port, texts, admin, shop, ['inventory:read']);
    expect((await getJson(port, '/api-keys', staff)).status).toBe(403);
  });
});

describeIfDatabase('the public API host (API-03 to API-05, API-08, API-14, API-23, API-24)', () => {
  it('answers a registered website with the shop the key belongs to, and the rate headers', async () => {
    const shop = await openShop(port, texts, 'pub-shop');
    const { key } = await makeKey(shop);
    const answer = await callApi('/v1/shop', key);
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(answer.body).toEqual({
      name: `Shop ${shop.slug}`,
      slug: shop.slug,
      metaPixelId: null,
      brand: null,
    });
    expect(answer.headers['access-control-allow-origin']).toBe(SITE);
    expect(answer.headers['vary']).toContain('Origin');
    expect(answer.headers['x-ratelimit-limit']).toBe('120');
    expect(answer.headers['x-ratelimit-remaining']).toBe('119');
    expect(Number(answer.headers['x-ratelimit-reset'])).toBeGreaterThan(0);
    // API-01: the list shows when the key was last used. The request never waits for that write, so neither may this.
    await expect
      .poll(async () => ((await shop.get('/api-keys')).body as KeyView[])[0]?.lastUsedAt ?? null)
      .not.toBeNull();
  });

  it('refuses a missing, malformed or unknown key, or a session cookie in its place, with 401', async () => {
    const shop = await openShop(port, texts, 'pub-401');
    await makeKey(shop);
    const missing = await callApi('/v1/shop', null);
    expect(missing.status).toBe(401);
    expect(errorOf(missing).message).toBe(said('ApiKeyMissing'));
    const cookieOnly = await callApi('/v1/shop', null, SITE, shop.headers({ host: API_HOST }));
    expect(cookieOnly.status).toBe(401);
    for (const key of ['abc', `lytro_pk_${'A'.repeat(32)}`]) {
      const refused = await callApi('/v1/shop', key);
      expect(refused.status).toBe(401);
      expect(errorOf(refused).message).toBe(said('ApiKeyInvalid'));
    }
  });

  it('refuses a website not registered on the key, and a call with no website at all, with 403', async () => {
    const shop = await openShop(port, texts, 'pub-403');
    const { key } = await makeKey(shop);
    for (const origin of ['https://elsewhere.com', null]) {
      const refused = await callApi('/v1/shop', key, origin);
      expect(refused.status).toBe(403);
      expect(errorOf(refused).message).toBe(said('WebsiteNotRegistered'));
    }
  });

  it('serves the public routes only on the API host at /v1, and nothing else there', async () => {
    const shop = await openShop(port, texts, 'pub-host');
    const { key } = await makeKey(shop);
    const auth = { authorization: `Bearer ${key}`, origin: SITE };
    expect((await getJson(port, '/public/shop', { ...auth, host: 'localhost' })).status).toBe(404);
    expect(
      (await getJson(port, '/public/shop', { ...auth, host: `${shop.slug}.localhost` })).status,
    ).toBe(404);
    expect((await callApi('/v1/me', key)).status).toBe(404);
    // Not even a route that needs no shop: the API host takes key authentication only.
    expect((await getJson(port, '/plans', { host: 'localhost' })).status).toBe(200);
    expect((await callApi('/v1/plans', key)).status).toBe(404);
    expect((await callApi('/api/v1/public/shop', key)).status).toBe(404);
    expect((await callApi('/shop', key)).status).toBe(404);
  });

  it('answers a preflight from a registered website, and refuses one from any other', async () => {
    const shop = await openShop(port, texts, 'pub-cors');
    await makeKey(shop);
    const preflight = (origin: string) =>
      sendExact(port, 'OPTIONS', '/v1/shop', undefined, {
        host: API_HOST,
        origin,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      });
    const allowed = await preflight(SITE);
    expect(allowed.status).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(SITE);
    expect(allowed.headers['access-control-allow-headers']).toContain('Authorization');
    expect(allowed.headers['access-control-expose-headers']).toContain('X-RateLimit-Remaining');
    const refused = await preflight('https://elsewhere.com');
    expect(refused.status).toBe(403);
    expect(refused.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('refuses a revoked key at once and an expired one, and lets two keys work side by side (rotation)', async () => {
    const shop = await openShop(port, texts, 'pub-rotate');
    const old = await makeKey(shop, { name: 'Old' });
    const next = await makeKey(shop, { name: 'Next' });
    expect((await callApi('/v1/shop', old.key)).status).toBe(200);
    expect((await callApi('/v1/shop', next.key)).status).toBe(200);
    const revoked = await shop.post(`/api-keys/${old.id}/revoke`, {});
    expect(revoked.status, JSON.stringify(revoked.body)).toBe(200);
    expect((revoked.body as KeyView).revokedAt).not.toBeNull();
    const refused = await callApi('/v1/shop', old.key);
    expect(refused.status).toBe(401);
    expect(errorOf(refused).message).toBe(said('ApiKeyWasRevoked'));
    expect((await callApi('/v1/shop', next.key)).status).toBe(200);
    // A revoked key keeps its record, and stays revoked.
    expect((await shop.patch(`/api-keys/${old.id}`, { name: 'Again' })).status).toBe(409);

    const soon = await makeKey(shop, {
      name: 'Short-lived',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    await admin.query(
      "UPDATE control.api_keys SET expires_at = now() - interval '1 second' WHERE id = $1",
      [soon.id],
    );
    const expired = await callApi('/v1/shop', soon.key);
    expect(expired.status).toBe(401);
    expect(errorOf(expired).message).toBe(said('ApiKeyExpired'));
  });

  it('follows a changed website address, and closes with the shop', async () => {
    const shop = await openShop(port, texts, 'pub-edit');
    const made = await makeKey(shop);
    const edited = await shop.patch(`/api-keys/${made.id}`, {
      websites: ['https://new.myshop.com'],
    });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect((await callApi('/v1/shop', made.key)).status).toBe(403);
    expect((await callApi('/v1/shop', made.key, 'https://new.myshop.com')).status).toBe(200);

    const closed = await openShop(port, texts, 'pub-closed');
    const { key } = await makeKey(closed);
    await admin.query('UPDATE control.tenants SET suspended_at = now() WHERE id = $1', [
      closed.tenantId,
    ]);
    const offline = await callApi('/v1/shop', key);
    expect(offline.status).toBe(403);
    expect(errorOf(offline).code).toBe('tenant_offline');
  });
});

describeIfDatabase('request limits (RTE-02 to RTE-07, RTE-10)', () => {
  it('holds a public key to no shop-wide minute: many visitors pass together, each counted alone (KNOWN-GAPS §82)', async () => {
    // A Trial shop: its key was once held to 60 a minute for all of its shoppers together.
    const shop = await openShop(port, texts, 'rate');
    const { key } = await makeKey(shop);
    for (const visitor of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) {
      let last: HttpResult | undefined;
      for (let index = 0; index < 50; index += 1) {
        last = await callApi('/v1/shop', key, SITE, { 'x-test-visitor': visitor });
        expect(last.status).toBe(200);
      }
      // RTE-02: the headers tell each visitor where it stands in its own minute.
      expect(last?.headers['x-ratelimit-limit']).toBe('120');
      expect(last?.headers['x-ratelimit-remaining']).toBe('70');
    }
  });

  it("holds one visitor to the operator's figure, per shop, until the window moves, and counts who was refused", async () => {
    const settings = app.get(PlatformSettingsService);
    await settings.set(PlatformSettingKey.PublicRequestsPerVisitorPerMinute, 3, randomUUID());
    try {
      const shop = await openShop(port, texts, 'rate-ip');
      const { key } = await makeKey(shop);
      const from = (visitor: string, apiKey = key) =>
        callApi('/v1/shop', apiKey, SITE, { 'x-test-visitor': visitor });
      const first = '198.51.100.1';
      const second = '198.51.100.2';
      for (let index = 0; index < 3; index += 1) expect((await from(first)).status).toBe(200);
      const refused = await from(first);
      expect(refused.status).toBe(429);
      expect(errorOf(refused).code).toBe('rate_limited');
      expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
      expect(refused.headers['x-ratelimit-limit']).toBe('3');
      expect(refused.headers['x-ratelimit-remaining']).toBe('0');
      expect((await from(first)).status).toBe(429);
      // Another visitor of the shop is not held back, nor the same visitor on another shop, nor the dashboard
      // (RTE-05).
      expect((await from(second)).status).toBe(200);
      const elsewhere = await openShop(port, texts, 'rate-ip-2');
      expect((await from(first, (await makeKey(elsewhere)).key)).status).toBe(200);
      expect((await shop.get('/api-keys')).status).toBe(200);
      // A minute later, the window has moved on.
      clockOffsetMs += 61_000;
      try {
        expect((await from(first)).status).toBe(200);
      } finally {
        clockOffsetMs -= 61_000;
      }
      for (let index = 0; index < 2; index += 1) expect((await from(second)).status).toBe(200);
      expect((await from(second)).status).toBe(429);

      // Stored with the cycle's requests: three refused, from two visitors, the first counted once.
      await app.get(RequestQuota).flush();
      const stored = await admin.query<{
        requests: string;
        refused_requests: string;
        refused_visitors: number;
      }>(
        `SELECT requests::text, refused_requests::text, refused_visitors
         FROM control.api_usage WHERE tenant_id = $1`,
        [shop.tenantId],
      );
      expect(stored.rows).toEqual([{ requests: '7', refused_requests: '3', refused_visitors: 2 }]);
      // BND-08's twin (Slice 11.5a.2): the minute's requests are on today's day too, and the usage page reads them.
      const today = dhakaDate(new Date());
      const days = await admin.query<{ day: string; requests: string }>(
        'SELECT day::text, requests::text FROM control.api_usage_daily WHERE tenant_id = $1',
        [shop.tenantId],
      );
      expect(days.rows).toEqual([{ day: today, requests: '7' }]);
      const usage = (await shop.get('/usage')).body as { requestDays: unknown };
      expect(usage.requestDays).toEqual([{ day: today, requests: 7 }]);
    } finally {
      await settings.set(PlatformSettingKey.PublicRequestsPerVisitorPerMinute, 120, randomUUID());
    }
  });

  it("counts a shop's requests per cycle, tells it at each share and its limit, serves through the grace, then refuses (RTE-03)", async () => {
    const shop = await openShop(port, texts, 'quota');
    await overrideLimit(shop.tenantId, 'requests_monthly', 5);
    const { key } = await makeKey(shop);
    const flush = () => app.get(RequestQuota).flush();
    // The fast-spend alert has its own case below.
    const told = () =>
      notices
        .levelsFor(shop.tenantId, UsageMetric.Requests)
        .filter((level) => level !== 'fast_spend');
    for (let index = 0; index < 3; index += 1)
      expect((await callApi('/v1/shop', key)).status).toBe(200);
    await flush();
    expect(told()).toEqual([50]);
    expect((await callApi('/v1/shop', key)).status).toBe(200);
    await flush();
    expect((await callApi('/v1/shop', key)).status).toBe(200);
    await flush();
    expect(told()).toEqual([50, 80, 100]);
    // The operator's 10 percent of grace: half a request past five rounds up to one more.
    expect((await callApi('/v1/shop', key)).status).toBe(200);
    await flush();
    expect(told()).toEqual([50, 80, 100, 'stopped']);
    const refused = await callApi('/v1/shop', key);
    expect(refused.status).toBe(429);
    expect(errorOf(refused).code).toBe('quota_exceeded');
    expect(errorOf(refused).message).toBe(said('RequestsUsedUp'));
    await flush();
    // Refused requests are not counted, and nothing is told twice.
    expect(told()).toEqual([50, 80, 100, 'stopped']);
    const stored = await admin.query<{ requests: string; warned_percent: number }>(
      'SELECT requests::text, warned_percent FROM control.api_usage WHERE tenant_id = $1',
      [shop.tenantId],
    );
    expect(stored.rows).toEqual([{ requests: '6', warned_percent: 110 }]);

    // Unlimited (PLN-19): counted, never refused.
    const open = await openShop(port, texts, 'quota-open');
    await overrideLimit(open.tenantId, 'requests_monthly', null);
    const openKey = (await makeKey(open)).key;
    for (let index = 0; index < 3; index += 1) {
      expect((await callApi('/v1/shop', openKey)).status).toBe(200);
    }
    await flush();
    const counted = await admin.query<{ requests: string }>(
      'SELECT requests::text FROM control.api_usage WHERE tenant_id = $1',
      [open.tenantId],
    );
    expect(counted.rows[0]?.requests).toBe('3');
    expect(notices.levelsFor(open.tenantId)).toEqual([]);
  });

  it('tells the owner and the operators once a day of an hour that spent a fast share of the cycle, refusing nothing (RTE-12)', async () => {
    const shop = await openShop(port, texts, 'fast');
    // The operator's 5 percent of 100 is 5 requests in one hour.
    await overrideLimit(shop.tenantId, 'requests_monthly', 100);
    const { key } = await makeKey(shop);
    const flush = () => app.get(RequestQuota).flush();
    const fast = () =>
      notices.notices.filter((n) => n.tenantId === shop.tenantId && n.level === 'fast_spend');
    for (let index = 0; index < 4; index += 1) {
      expect((await callApi('/v1/shop', key)).status).toBe(200);
    }
    await flush();
    expect(fast()).toEqual([]);
    expect((await callApi('/v1/shop', key)).status).toBe(200);
    await flush();
    expect(fast()).toEqual([
      expect.objectContaining({ metric: 'requests', used: 5, limit: 100 }) as unknown,
    ]);
    // The same hour, and the next: not again within a day.
    for (let index = 0; index < 5; index += 1) {
      expect((await callApi('/v1/shop', key)).status).toBe(200);
    }
    await flush();
    expect(fast()).toHaveLength(1);
    const stored = await admin.query<{ alerted: boolean }>(
      'SELECT fast_spend_alerted_at IS NOT NULL AS alerted FROM control.api_usage WHERE tenant_id = $1',
      [shop.tenantId],
    );
    expect(stored.rows).toEqual([{ alerted: true }]);
  });

  it("reads every plan's monthly requests from the plan, and every shop's from its snapshot, with no per-minute figure (RTE-10)", async () => {
    const plans = await admin.query<{ name: string; minute: boolean; cycle: number }>(
      `SELECT name, limits ? 'requests_per_minute_public' AS minute,
              (limits->>'requests_monthly')::int AS cycle
       FROM control.plans WHERE name IN ('Trial', 'Pay-as-you-go', 'Starter') ORDER BY name`,
    );
    expect(plans.rows).toEqual([
      { name: 'Pay-as-you-go', minute: false, cycle: 100_000 },
      { name: 'Starter', minute: false, cycle: 200_000 },
      { name: 'Trial', minute: false, cycle: 20_000 },
    ]);
    const shop = await openShop(port, texts, 'snapshot');
    const snapshot = await admin.query<{ minute: boolean; cycle: number }>(
      `SELECT plan_snapshot ? 'requests_per_minute_public' AS minute,
              (plan_snapshot->>'requests_monthly')::int AS cycle
       FROM control.tenants WHERE id = $1`,
      [shop.tenantId],
    );
    expect(snapshot.rows[0]).toEqual({ minute: false, cycle: 20_000 });
  });
});

describeIfDatabase('the day-60 deletion (LIF-19)', () => {
  it("removes a lapsed shop's keys and request counts", async () => {
    const shop = await openShop(port, texts, 'key-erase');
    const { key } = await makeKey(shop);
    expect((await callApi('/v1/shop', key)).status).toBe(200);
    await app.get(RequestQuota).flush();
    await app.get(PublicApiEraser).deleteAllForTenant(shop.tenantId);
    const left = await admin.query<{ keys: string; usage: string; days: string }>(
      `SELECT (SELECT count(*) FROM control.api_keys WHERE tenant_id = $1)::text AS keys,
              (SELECT count(*) FROM control.api_usage WHERE tenant_id = $1)::text AS usage,
              (SELECT count(*) FROM control.api_usage_daily WHERE tenant_id = $1)::text AS days`,
      [shop.tenantId],
    );
    expect(left.rows[0]).toEqual({ keys: '0', usage: '0', days: '0' });
  });
});
