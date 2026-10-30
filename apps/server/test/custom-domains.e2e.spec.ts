import 'dotenv/config';
import { request as httpRequest } from 'node:http';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DAY_MS, HOUR_MS } from '../src/common/time';
import type { MessageKey } from '../src/common/i18n/message-key';
import { translate } from '../src/common/i18n/messages';
import { AppModule } from '../src/app/app.module';
import { DomainEraser } from '../src/modules/domains/services/domain-eraser';
import { DomainService } from '../src/modules/domains/services/domain.service';
import { DNS_LOOKUP } from '../src/modules/domains/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { TenantCache } from '../src/modules/tenancy/services/tenant-cache';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { DnsTable } from './support/dns-table';
import { sendExact, type HttpResult } from './support/http';
import { errorOf, fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 13, its read agreed 2026-10-30: a shop's own domain -- the plan gate (TEN-10, PYG-07), one a shop and
// one shop a name (TEN-12), verification by its records (TEN-11) through a DNS the test writes, the twin, the shop's
// main address on /me, the storefront's context and the catalog feed, the edge's certificate question (TEN-13), a
// downgrade keeping it off (DWN-10), the record going missing, 72 hours unverified, removing it (TEN-14), and the
// day-60 deletion freeing it. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_domains_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const SECRET = 'domains-e2e-storefront-secret-0123456789abcdef';
const OURS = '203.0.113.10';

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const dns = new DnsTable();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'domains-e2e-otp-secret-0123456789abcdefghijk';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['PLATFORM_ADDRESSES'] = OURS;
  process.env['STOREFRONT_SECRET'] = SECRET;
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(DNS_LOOKUP)
    .useValue(dns)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  delete process.env['PLATFORM_ADDRESSES'];
  delete process.env['STOREFRONT_SECRET'];
  await app.close();
  await admin.end();
});

interface DomainRecord {
  type: string;
  name: string;
  value: string;
}

interface DomainView {
  allowed: boolean;
  domain: {
    hostname: string;
    twin: string;
    state: 'pending' | 'active' | 'failed' | 'off';
    lost: boolean;
    twinActive: boolean;
    records: DomainRecord[];
    twinRecords: DomainRecord[];
    checkedAt: string | null;
    verifiedAt: string | null;
  } | null;
}

interface Context {
  outcome: 'open' | 'closed' | 'not_found';
  shop: { slug: string; origin: string; mainHost: string | null; publicOrigin: string } | null;
}

function said(key: MessageKey): string {
  return translate(key, 'bn');
}

/** A shop on a plan that includes its own domain (Growth and Pro carry the feature in their snapshot). */
async function growthShop(prefix: string): Promise<ShopClient> {
  const shop = await openShop(port, texts, prefix);
  await setFeature(shop, true);
  return shop;
}

/** The plan's feature snapshot with or without the domain, as moving between plans leaves it. */
async function setFeature(shop: ShopClient, on: boolean): Promise<void> {
  await admin.query(`UPDATE control.tenants SET feature_snapshot = $2 WHERE id = $1`, [
    shop.tenantId,
    JSON.stringify(on ? { custom_domain: true } : {}),
  ]);
}

async function viewOf(shop: ShopClient): Promise<DomainView> {
  const read = await shop.get('/domain');
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return read.body as DomainView;
}

async function add(shop: ShopClient, hostname: string): Promise<DomainView> {
  const added = await shop.post('/domain', { hostname });
  expect(added.status, JSON.stringify(added.body)).toBe(201);
  return added.body as DomainView;
}

/** A root domain's records, pointing here for this shop. */
function pointRoot(host: string, slug: string): void {
  dns.set(host, { a: [OURS] });
  dns.set(`_lytro.${host}`, { txt: [`lytro=${slug}`] });
}

/** The edge's own view: the host's shop, the way the storefront's server asks (forgetting the minute's cache first). */
async function contextOf(host: string): Promise<Context> {
  app.get(TenantCache).clear();
  const result = await sendExact(
    port,
    'GET',
    `/api/v1/internal/storefront/context?host=${encodeURIComponent(host)}`,
    undefined,
    { host: 'localhost', 'x-lytro-storefront': SECRET },
  );
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body as Context;
}

/** TEN-13: the edge's question before it gets a certificate for a name. */
function ask(domain: string): Promise<HttpResult> {
  return sendExact(
    port,
    'GET',
    `/api/v1/internal/domains/ask?domain=${encodeURIComponent(domain)}`,
    undefined,
    { host: 'localhost' },
  );
}

async function ownDomainOnMe(shop: ShopClient): Promise<string | null> {
  return ((await shop.get('/me')).body as { tenant: { ownDomain: string | null } }).tenant
    .ownDomain;
}

async function actionsOf(shop: ShopClient): Promise<string[]> {
  return ((await shop.get('/activity')).body as { entries: { action: string }[] }).entries.map(
    (entry) => entry.action,
  );
}

/** The feed as Meta's fetcher reads it: on the API host, the CSV as sent. */
function feedText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, path: new URL(url).pathname, headers: { host: 'api.localhost' } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve(Buffer.concat(chunks).toString('utf8'));
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/** The recurring check as it runs at this moment. */
function runChecksAt(at: Date): ReturnType<DomainService['runChecks']> {
  return app.get(DomainService).runChecks(at);
}

describeIfDatabase("a shop's own domain (TEN-09 to TEN-14, DWN-10)", () => {
  it('offers the upgrade to a shop whose plan does not include one (TEN-10, PYG-07)', async () => {
    const shop = await openShop(port, texts, 'dom-trial');
    expect(await viewOf(shop)).toEqual({ allowed: false, domain: null });
    const refused = await shop.post('/domain', { hostname: 'trial-shop.test' });
    expect(refused.status).toBe(402);
    expect(errorOf(refused)).toMatchObject({
      code: 'plan_feature_unavailable',
      message: said('DomainNeedsPlan'),
    });
    expect(await viewOf(shop)).toEqual({ allowed: false, domain: null });
  });

  it("refuses what is not a domain, and Lytro's own addresses", async () => {
    const shop = await growthShop('dom-format');
    for (const typed of ['https://megh', '203.0.113.10', 'megh .com']) {
      const refused = await shop.post('/domain', { hostname: typed });
      expect(refused.status, typed).toBe(400);
      expect(fieldsOf(refused)).toEqual({ hostname: 'invalid_format' });
      expect(errorOf(refused).message).toBe(said('DomainFormat'));
    }
    for (const typed of [`${shop.slug}.localhost`, 'app.localhost', 'API.localhost.']) {
      const refused = await shop.post('/domain', { hostname: typed });
      expect(refused.status, typed).toBe(400);
      expect(errorOf(refused).message, typed).toBe(said('DomainIsLytro'));
    }
    expect((await viewOf(shop)).domain).toBeNull();
  });

  it('waits for its records, then becomes the main address everywhere (TEN-11, Slice 13 points 1 to 3)', async () => {
    const shop = await growthShop('dom-root');
    const added = await add(shop, ' https://Megh-Root.test/shop ');
    expect(added).toMatchObject({
      allowed: true,
      domain: {
        hostname: 'megh-root.test',
        twin: 'www.megh-root.test',
        state: 'pending',
        lost: false,
        twinActive: false,
        records: [
          { type: 'A', name: '@', value: OURS },
          { type: 'TXT', name: '_lytro', value: `lytro=${shop.slug}` },
        ],
        twinRecords: [{ type: 'CNAME', name: 'www', value: `${shop.slug}.localhost` }],
        verifiedAt: null,
      },
    });
    // Checked once straight away: nothing there yet.
    expect(added.domain?.checkedAt).not.toBeNull();
    expect((await shop.post('/domain', { hostname: 'another.test' })).status).toBe(409);
    expect(errorOf(await shop.post('/domain', { hostname: 'another.test' })).message).toBe(
      said('DomainAlreadySet'),
    );
    // Waiting, it answers for no one (TEN-25) and gets no certificate.
    expect((await contextOf('megh-root.test')).outcome).toBe('not_found');
    expect((await ask('megh-root.test')).status).toBe(404);
    expect(await ownDomainOnMe(shop)).toBeNull();

    // The A record alone does not name the shop; with the TXT it does.
    dns.set('megh-root.test', { a: [OURS] });
    expect((await shop.post('/domain/check', {})).body).toMatchObject({
      domain: { state: 'pending' },
    });
    pointRoot('megh-root.test', shop.slug);
    dns.set('www.megh-root.test', { cname: [`${shop.slug}.localhost`] });
    const checked = await shop.post('/domain/check', {});
    expect(checked.status, JSON.stringify(checked.body)).toBe(200);
    expect(checked.body).toMatchObject({ domain: { state: 'active', twinActive: true } });
    expect((checked.body as DomainView).domain?.verifiedAt).not.toBeNull();

    // The shop answers on the domain and its twin; its own address leads there.
    for (const host of ['megh-root.test', 'www.megh-root.test', `${shop.slug}.localhost`]) {
      expect(await contextOf(host), host).toMatchObject({
        outcome: 'open',
        shop: {
          slug: shop.slug,
          origin: `http://${shop.slug}.localhost`,
          mainHost: 'megh-root.test',
          publicOrigin: 'http://megh-root.test',
        },
      });
    }
    expect((await ask('megh-root.test')).status).toBe(200);
    expect((await ask('www.megh-root.test')).status).toBe(200);
    expect((await ask(`${shop.slug}.localhost`)).status).toBe(404);
    expect((await ask('nobody.test')).status).toBe(404);
    expect(await ownDomainOnMe(shop)).toBe('megh-root.test');
    expect(await actionsOf(shop)).toEqual(
      expect.arrayContaining(['domain_added', 'domain_activated']),
    );
  });

  it('verifies a www name by its one CNAME, never one naming another shop (TEN-12)', async () => {
    const shop = await growthShop('dom-www');
    expect((await add(shop, 'www.megh-www.test')).domain).toMatchObject({
      twin: 'megh-www.test',
      records: [{ type: 'CNAME', name: 'www', value: `${shop.slug}.localhost` }],
      twinRecords: [{ type: 'A', name: '@', value: OURS }],
    });
    dns.set('www.megh-www.test', { cname: ['someone-else.localhost'] });
    expect((await shop.post('/domain/check', {})).body).toMatchObject({
      domain: { state: 'pending' },
    });
    dns.set('www.megh-www.test', { cname: [`${shop.slug}.localhost`] });
    expect((await shop.post('/domain/check', {})).body).toMatchObject({
      domain: { state: 'active', twinActive: false },
    });
    // Without the twin's record the twin answers for no one.
    expect((await contextOf('megh-www.test')).outcome).toBe('not_found');
    expect((await contextOf('www.megh-www.test')).shop?.mainHost).toBe('www.megh-www.test');
  });

  it('refuses a domain active on another shop, its twin too (TEN-12)', async () => {
    const owner = await growthShop('dom-owner');
    await add(owner, 'taken-shop.test');
    pointRoot('taken-shop.test', owner.slug);
    dns.set('www.taken-shop.test', { a: [OURS] });
    expect((await owner.post('/domain/check', {})).body).toMatchObject({
      domain: { state: 'active', twinActive: true },
    });
    const other = await growthShop('dom-other');
    for (const typed of ['taken-shop.test', 'www.taken-shop.test']) {
      const refused = await other.post('/domain', { hostname: typed });
      expect(refused.status, typed).toBe(409);
      expect(fieldsOf(refused)).toEqual({ hostname: 'taken' });
      expect(errorOf(refused).message).toBe(said('DomainTaken'));
    }
  });

  it('turns off with a plan that does not include it and keeps it; upgrading turns it on (DWN-10)', async () => {
    const shop = await growthShop('dom-plan');
    await add(shop, 'megh-plan.test');
    pointRoot('megh-plan.test', shop.slug);
    await shop.post('/domain/check', {});
    expect((await contextOf('megh-plan.test')).outcome).toBe('open');
    await setFeature(shop, false);
    // At once, though the server's host lookup still holds the domain for its minute.
    const held = await sendExact(
      port,
      'GET',
      `/api/v1/internal/storefront/context?host=megh-plan.test`,
      undefined,
      { host: 'localhost', 'x-lytro-storefront': SECRET },
    );
    expect((held.body as Context).outcome).toBe('not_found');
    expect(await viewOf(shop)).toMatchObject({ allowed: false, domain: { state: 'off' } });
    expect((await contextOf('megh-plan.test')).outcome).toBe('not_found');
    expect((await contextOf(`${shop.slug}.localhost`)).shop).toMatchObject({
      mainHost: null,
      publicOrigin: `http://${shop.slug}.localhost`,
    });
    expect((await ask('megh-plan.test')).status).toBe(404);
    expect(await ownDomainOnMe(shop)).toBeNull();
    // Kept: no other shop can take it meanwhile.
    const other = await growthShop('dom-plan-other');
    expect((await other.post('/domain', { hostname: 'megh-plan.test' })).status).toBe(409);

    await setFeature(shop, true);
    expect((await viewOf(shop)).domain?.state).toBe('active');
    expect((await contextOf('megh-plan.test')).outcome).toBe('open');
  });

  it('is waiting again after two daily checks without its record, and fails after 72 hours (point 5)', async () => {
    const shop = await growthShop('dom-lost');
    await add(shop, 'megh-lost.test');
    pointRoot('megh-lost.test', shop.slug);
    await shop.post('/domain/check', {});
    const start = Date.now();

    // Rechecked once a day, not on every run.
    const verified = (await viewOf(shop)).domain?.checkedAt;
    await runChecksAt(new Date(start + HOUR_MS));
    expect((await viewOf(shop)).domain?.checkedAt).toBe(verified);
    dns.clear('megh-lost.test');
    await runChecksAt(new Date(start + DAY_MS));
    expect((await viewOf(shop)).domain).toMatchObject({ state: 'active', lost: false });
    // DNS that cannot answer counts as no check at all.
    dns.down = true;
    await runChecksAt(new Date(start + 2 * DAY_MS));
    dns.down = false;
    expect((await viewOf(shop)).domain).toMatchObject({ state: 'active', lost: false });
    await runChecksAt(new Date(start + 2 * DAY_MS + HOUR_MS));
    expect((await viewOf(shop)).domain).toMatchObject({ state: 'pending', lost: true });
    expect((await contextOf('megh-lost.test')).outcome).toBe('not_found');
    expect(await ownDomainOnMe(shop)).toBeNull();
    expect(await actionsOf(shop)).toContain('domain_lost');

    // Its 72 hours start from when it went back to waiting.
    const lostAt = start + 2 * DAY_MS + HOUR_MS;
    await runChecksAt(new Date(lostAt + 71 * HOUR_MS));
    expect((await viewOf(shop)).domain?.state).toBe('pending');
    await runChecksAt(new Date(lostAt + 72 * HOUR_MS));
    expect((await viewOf(shop)).domain?.state).toBe('failed');
    // Not checked again until the seller asks; asking starts the 72 hours over, and finds it once it is back.
    pointRoot('megh-lost.test', shop.slug);
    await runChecksAt(new Date(lostAt + 80 * HOUR_MS));
    expect((await viewOf(shop)).domain?.state).toBe('failed');
    expect((await shop.post('/domain/check', {})).body).toMatchObject({
      domain: { state: 'active', lost: false },
    });
  });

  it('stops answering on a removed domain at once, and it may be added again (TEN-14)', async () => {
    const shop = await growthShop('dom-remove');
    await add(shop, 'megh-remove.test');
    pointRoot('megh-remove.test', shop.slug);
    await shop.post('/domain/check', {});
    expect((await contextOf('megh-remove.test')).outcome).toBe('open');

    const removed = await shop.delete('/domain');
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    expect(removed.body).toEqual({ allowed: true, domain: null });
    // No cache clearing here: removing it clears the shop's hosts itself (TEN-27), so the edge is told no at once.
    expect((await ask('megh-remove.test')).status).toBe(404);
    const raw = await sendExact(
      port,
      'GET',
      `/api/v1/internal/storefront/context?host=megh-remove.test`,
      undefined,
      { host: 'localhost', 'x-lytro-storefront': SECRET },
    );
    expect((raw.body as Context).outcome).toBe('not_found');
    expect((await contextOf(`${shop.slug}.localhost`)).shop?.mainHost).toBeNull();
    expect(await actionsOf(shop)).toContain('domain_removed');
    expect((await shop.delete('/domain')).status).toBe(404);
    expect((await shop.post('/domain/check', {})).status).toBe(404);

    // Free again, to this shop or any other.
    const other = await growthShop('dom-readd');
    // SEC-02: another shop sees, checks and removes only its own -- none here, so nothing of this shop's.
    await add(shop, 'megh-isolated.test');
    expect(await viewOf(other)).toEqual({ allowed: true, domain: null });
    expect((await other.post('/domain/check', {})).status).toBe(404);
    expect((await other.delete('/domain')).status).toBe(404);
    expect((await viewOf(shop)).domain?.hostname).toBe('megh-isolated.test');
    expect((await shop.delete('/domain')).status).toBe(200);
    expect((await add(other, 'megh-remove.test')).domain?.state).toBe('pending');
  });

  it("frees a deleted shop's domain (LIF-19)", async () => {
    const shop = await growthShop('dom-deleted');
    await add(shop, 'megh-deleted.test');
    pointRoot('megh-deleted.test', shop.slug);
    await shop.post('/domain/check', {});
    const eraser = app.get(DomainEraser);
    await eraser.removeAllForTenant(shop.tenantId, new Date());
    await eraser.removeAllForTenant(shop.tenantId, new Date());
    expect((await contextOf('megh-deleted.test')).outcome).toBe('not_found');
    const other = await growthShop('dom-after');
    expect((await add(other, 'megh-deleted.test')).domain?.hostname).toBe('megh-deleted.test');
  });

  it("links the catalog feed to the shop's main address (FED-02)", async () => {
    const shop = await growthShop('dom-feed');
    const made = await shop.post('/products', {
      name: 'Blue kurti',
      basePrice: 900,
      variants: [{ optionIds: [], openingStock: 3 }],
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const feed = await shop.get('/catalog-feed');
    expect(feed.status, JSON.stringify(feed.body)).toBe(200);
    const url = (feed.body as { url: string }).url;
    expect(await feedText(url)).toContain(`http://${shop.slug}.localhost/l/`);

    await add(shop, 'megh-feed.test');
    pointRoot('megh-feed.test', shop.slug);
    await shop.post('/domain/check', {});
    expect(await feedText(url)).toContain('http://megh-feed.test/l/');
  });
});
