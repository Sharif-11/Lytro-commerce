import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LedgerEntryType } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { PurchaseService } from '../src/modules/billing/services/purchase.service';
import { BalanceService } from '../src/modules/balance/services/balance.service';
import { PlatformAdSender } from '../src/modules/platform-ads/services/platform-ad-sender';
import { PlatformAdEvent, type PlatformAdJob } from '../src/modules/platform-ads/types/platform-ad';
import type {
  MetaConversions,
  MetaSendOptions,
  MetaServerEvent,
} from '../src/modules/shared/meta-conversions/ports/meta-conversions';
import { META_CONVERSIONS } from '../src/modules/shared/meta-conversions/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { cookieFrom, deleteJson, postJson } from './support/http';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// MKT-01 to MKT-06 (the owner, 2026-11-24): Lytro's own Meta events against a real database -- a sign-up (Lead) and a
// shop made (CompleteRegistration) queued with the visit they came from, a shop's first order (ShopActivated) and its
// first paid plan (Subscribe) queued once however its orders and payments go on, and each sent to Lytro's own pixel.
// Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_platform_ads_test';
const SLOW = 60_000;
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

const FBP = 'fb.1.1700000000000.1234567890';
const FBC = 'fb.1.1700000000000.IwAR2abcDEF';
const BROWSER = { 'user-agent': 'E2E Browser/1.0' };

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const sent: {
  pixel: string;
  token: string;
  events: MetaServerEvent[];
  options?: MetaSendOptions;
}[] = [];
const meta: MetaConversions = {
  send: (pixel, token, events, options) => {
    sent.push({ pixel, token, events, options });
    return Promise.resolve();
  },
};

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'platform-ads-e2e-otp-secret-0123456789abcd';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['LYTRO_META_PIXEL_ID'] = '1234567890';
  process.env['LYTRO_META_CAPI_TOKEN'] = 'e2e-capi-token';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(META_CONVERSIONS)
    .useValue(meta)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  // A fresh database takes every migration first: longer than the default on a busy machine.
}, 180_000);

afterAll(async () => {
  if (!ADMIN_URL) return;
  delete process.env['LYTRO_META_PIXEL_ID'];
  delete process.env['LYTRO_META_CAPI_TOKEN'];
  await app.close();
  await admin.end();
});

/** Lytro's own events queued so far, oldest first, as many as were queued (the outbox keeps a row once relayed). */
async function queued(where: string, value: string): Promise<PlatformAdJob[]> {
  const rows = await admin.query<{ payload: PlatformAdJob }>(
    `SELECT payload FROM control.job_outbox WHERE queue_name = 'platform_ad_event' AND payload->>${where} = $1
     ORDER BY created_at, id`,
    [value],
  );
  return rows.rows.map((row) => row.payload);
}

async function signUp(phone: string, extra: Record<string, string>) {
  await postJson(port, '/auth/phone/code', { phone }, { host: 'localhost' });
  return postJson(
    port,
    '/auth/phone/verify',
    { phone, code: texts.codeFor(phone) },
    { host: 'localhost', ...BROWSER, ...extra },
  );
}

async function product(shop: ShopClient): Promise<string> {
  const made = await shop.post('/products', {
    name: 'Three-piece',
    basePrice: 1450,
    variants: [{ optionIds: [], openingStock: 20 }],
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return (made.body as { variants: { id: string }[] }).variants[0]?.id ?? '';
}

async function order(shop: ShopClient, variantId: string): Promise<string> {
  const placed = await postJson(
    port,
    '/orders',
    {
      customerName: 'Rahima',
      phone: '01712345670',
      fulfilmentType: 'takeaway',
      items: [{ variantId, quantity: 1 }],
    },
    shop.headers({ 'idempotency-key': randomUUID() }),
  );
  expect(placed.status, JSON.stringify(placed.body)).toBe(201);
  return (placed.body as { id: string }).id;
}

describeIfDatabase("Lytro's own Meta events (MKT-01 to MKT-06)", () => {
  it(
    'queues a sign-up as Lead with the visit it came from -- once, never for a returning sign-in -- and the shop it makes as CompleteRegistration',
    async () => {
      const phone = texts.freshPhone();
      const visit = {
        cookie: `_fbp=${FBP}; _fbc=${FBC}`,
        referer: `https://app.localhost/verify-code?phone=${phone}`,
      };
      const entered = await signUp(phone, visit);
      expect(entered.status).toBe(200);
      const leads = await queued("'hashedPhone'", sha(`88${phone}`));
      expect(leads).toEqual([
        expect.objectContaining({
          event: 'Lead',
          tenantId: null,
          visit: expect.objectContaining({
            fbp: FBP,
            fbc: FBC,
            userAgent: 'E2E Browser/1.0',
            pageUrl: 'https://app.localhost/verify-code',
          }) as unknown,
        }),
      ]);
      expect(JSON.stringify(leads)).not.toContain(phone);

      const session = {
        cookie: `${cookieFrom(entered)}; _fbp=${FBP}`,
        'x-csrf-token': (entered.body as { csrfToken: string }).csrfToken,
      };
      const slug = `ads-s${randomUUID().replace(/-/g, '').slice(0, 9)}`;
      const made = await postJson(
        port,
        '/shops',
        { ownerName: 'Owner', shopName: `Shop ${slug}`, address: slug },
        { host: 'localhost', ...BROWSER, ...session },
      );
      expect(made.status).toBe(201);
      const tenantId = (made.body as { tenantId: string }).tenantId;
      expect(await queued("'tenantId'", tenantId)).toEqual([
        expect.objectContaining({
          event: 'CompleteRegistration',
          eventId: `registration-${tenantId}`,
          hashedPhone: sha(`88${phone}`),
          visit: expect.objectContaining({ fbp: FBP, fbc: null }) as unknown,
        }),
      ]);

      // A returning sign-in by code is no sign-up. (The first code is aged past its resend wait.)
      await admin.query(
        "UPDATE control.verification_challenges SET created_at = now() - interval '10 minutes'",
      );
      expect((await signUp(phone, visit)).status).toBe(200);
      expect(await queued("'hashedPhone'", sha(`88${phone}`))).toHaveLength(2);
    },
    SLOW,
  );

  it(
    "queues a shop's first order as ShopActivated once, even when that order is deleted and another made",
    async () => {
      const shop = await openShop(port, texts, 'ads');
      const variantId = await product(shop);
      const first = await order(shop, variantId);
      expect((await deleteJson(port, `/orders/${first}`, shop.headers())).status).toBe(200);
      await order(shop, variantId);

      const events = (await queued("'tenantId'", shop.tenantId)).filter(
        (job) => job.event === PlatformAdEvent.ShopActivated,
      );
      expect(events).toEqual([
        expect.objectContaining({ eventId: `activated-${shop.tenantId}`, visit: null }),
      ]);
      const claimed = await admin.query(
        'SELECT event_name FROM control.platform_ad_events WHERE tenant_id = $1',
        [shop.tenantId],
      );
      expect(claimed.rows).toEqual([{ event_name: 'ShopActivated' }]);
    },
    SLOW,
  );

  it(
    "queues a shop's first paid plan as Subscribe with its amount, once, and sends it to Lytro's pixel by the owner's phone",
    async () => {
      const planId =
        (
          await admin.query<{ id: string }>(
            `INSERT INTO control.plans (name, rank, for_sale, limits) VALUES ('Ads plan', 962, true, $1) RETURNING id`,
            [JSON.stringify({ products: 100, staff: 3, storage_mb: 100 })],
          )
        ).rows[0]?.id ?? '';
      const termId =
        (
          await admin.query<{ id: string }>(
            `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
             VALUES ('Ads month', 'Ads month', 1, true, 1) RETURNING id`,
          )
        ).rows[0]?.id ?? '';
      await admin.query(
        'INSERT INTO control.plan_prices (plan_id, billing_term_id, price) VALUES ($1, $2, 349)',
        [planId, termId],
      );
      const shop = await openShop(port, texts, 'ads');
      await app.get(BalanceService).creditStandalone({
        tenantId: shop.tenantId,
        amount: '1000.00',
        type: LedgerEntryType.TopUp,
      });
      const purchase = app.get(PurchaseService);
      for (let round = 0; round < 2; round += 1) {
        const quote = await purchase.quote(shop.tenantId, planId, termId);
        await purchase.confirmFromBalance(quote.id, shop.tenantId);
      }

      const subscribed = (await queued("'tenantId'", shop.tenantId)).filter(
        (job) => job.event === PlatformAdEvent.Subscribe,
      );
      expect(subscribed).toEqual([
        expect.objectContaining({
          eventId: `subscribe-${shop.tenantId}`,
          value: '349.00',
          hashedPhone: null,
        }),
      ]);

      const job = subscribed[0];
      if (!job) throw new Error('no Subscribe queued');
      await app.get(PlatformAdSender).send(job);
      const told = sent.find((call) => call.events[0]?.event_id === job.eventId);
      const ownerPhone = (
        await admin.query<{ phone: string }>(
          'SELECT phone FROM tenant.users WHERE tenant_id = $1 AND is_owner',
          [shop.tenantId],
        )
      ).rows[0]?.phone;
      expect(told).toMatchObject({
        pixel: '1234567890',
        token: 'e2e-capi-token',
        events: [
          {
            event_name: 'Subscribe',
            action_source: 'system_generated',
            user_data: { ph: [sha(`88${ownerPhone ?? ''}`)] },
            custom_data: { currency: 'BDT', value: 349 },
          },
        ],
      });
    },
    SLOW,
  );
});
