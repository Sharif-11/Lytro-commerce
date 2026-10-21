import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TenantState } from '@lytronix/validators';
import pg from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { DAY_MS } from '../src/common/time';
import { DowngradeService } from '../src/modules/billing/services/downgrade.service';
import { TenantService } from '../src/modules/tenancy/services/tenant.service';
import { MediaProcessor } from '../src/modules/media/services/media-processor';
import { MEDIA_STORAGE } from '../src/modules/media/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { sendExact } from './support/http';
import { MemoryStorage } from './support/memory-storage';
import { errorOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 10's done-when: a shop with 340 products downgraded to a plan of 100 keeps all 340 listed, public and
// for sale, and is refused a 341st; its storage alike. The preview counts products and storage with the seats; for 30
// days a checklist ticks each limit off as it is fixed; then one final warning goes out. DWN-03, DWN-07, DWN-09,
// DWN-12 to DWN-14, LIM-03. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_downgrade_checklist_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const SITE = 'https://myshop.com';
const PRODUCTS = 340;

interface Checklist {
  downgradedAt: string;
  endsAt: string;
  items: { key: string; used: number; limit: number; fixed: boolean }[];
  finalWarningAt: string | null;
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const storage = new MemoryStorage();
let largePlanId = '';
let smallPlanId = '';

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'downgrade-checklist-e2e-otp-secret-0123456789ab';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const plan = async (name: string, rank: number, limits: object): Promise<string> =>
    (
      await admin.query<{ id: string }>(
        `INSERT INTO control.plans (name, rank, for_sale, limits) VALUES ($1, $2, true, $3) RETURNING id`,
        [name, rank, JSON.stringify(limits)],
      )
    ).rows[0]?.id ?? '';
  largePlanId = await plan('Large', 900, { products: 1000, staff: 5, storage_mb: 1000 });
  // No storage at all, so the one photo the shop holds is over it.
  smallPlanId = await plan('Small', 899, { products: 100, staff: 5, storage_mb: 0 });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(MEDIA_STORAGE)
    .useValue(storage)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

/** Puts the shop on the large plan for a running period, as a purchase would (snapshot and all). */
async function onLargePlan(shop: ShopClient): Promise<void> {
  await admin.query(
    `UPDATE control.tenants SET state = 'active', plan_id = $1,
       plan_snapshot = (SELECT limits FROM control.plans WHERE id = $1),
       period_start = now() - interval '10 days', period_end = now() + interval '20 days'
     WHERE id = $2`,
    [largePlanId, shop.tenantId],
  );
}

async function downgradeNow(shop: ShopClient, now: Date): Promise<void> {
  const service = app.get(DowngradeService);
  await service.schedule(shop.tenantId, smallPlanId);
  const change = await service.getScheduled(shop.tenantId);
  if (!change) throw new Error('no downgrade scheduled');
  await service.apply(change, now);
}

async function checklistOf(shop: ShopClient): Promise<Checklist | null> {
  const answer = await shop.get('/billing/downgrade/checklist');
  expect(answer.status, JSON.stringify(answer.body)).toBe(200);
  return (answer.body as { checklist: Checklist | null }).checklist;
}

async function uploadPhoto(shop: ShopClient): Promise<{ status: number; id: string | null }> {
  const photo = await sharp(randomBytes(400 * 300 * 3), {
    raw: { width: 400, height: 300, channels: 3 },
  })
    .jpeg()
    .toBuffer();
  const started = await shop.post('/media/uploads', {
    kind: 'image',
    contentType: 'image/jpeg',
    bytes: photo.length,
    purpose: 'product_image',
  });
  if (started.status !== 201) return { status: started.status, id: null };
  const { media, upload } = started.body as { media: { id: string }; upload: { url: string } };
  expect(storage.send(upload.url, photo, 'image/jpeg')).toBe(200);
  expect((await shop.post(`/media/${media.id}/finish`, {})).status).toBe(201);
  await app.get(MediaProcessor).process(shop.tenantId, media.id);
  return { status: 201, id: media.id };
}

/** Every product a shopper can see, page by page through the public catalogue (PRD-09). */
async function publicCount(key: string): Promise<number> {
  let count = 0;
  let cursor: string | null = null;
  do {
    const path: string = `/v1/catalogue/products?limit=60${cursor ? `&cursor=${cursor}` : ''}`;
    const page = await sendExact(port, 'GET', path, undefined, {
      host: 'api.localhost',
      authorization: `Bearer ${key}`,
      origin: SITE,
    });
    expect(page.status, JSON.stringify(page.body)).toBe(200);
    const body = page.body as { products: unknown[]; nextCursor: string | null };
    count += body.products.length;
    cursor = body.nextCursor;
  } while (cursor !== null);
  return count;
}

function override(shop: ShopClient, key: string, value: number): Promise<unknown> {
  return admin.query(
    `INSERT INTO control.plan_limit_overrides (tenant_id, limit_key, value, reason, set_by)
     VALUES ($1, $2, $3, 'downgrade checklist test', gen_random_uuid())
     ON CONFLICT (tenant_id, limit_key) DO UPDATE SET value = EXCLUDED.value`,
    [shop.tenantId, key, JSON.stringify(value)],
  );
}

describeIfDatabase(
  'a downgrade that leaves a shop over its limits (DWN-03, DWN-07, DWN-09, DWN-12 to DWN-14)',
  () => {
    it('keeps 340 products listed, public and for sale on a plan of 100, refuses the 341st, and storage alike', async () => {
      const shop = await openShop(port, texts, 'downgrade');
      await onLargePlan(shop);
      const photo = await uploadPhoto(shop);
      expect(photo.status).toBe(201);
      for (let index = 1; index <= PRODUCTS; index += 1) {
        const made = await shop.post('/products', {
          name: `Product ${String(index)}`,
          basePrice: 100 + index,
          variants: [{ optionIds: [] }],
        });
        expect(made.status, JSON.stringify(made.body)).toBe(201);
      }

      // DWN-03: the preview counts what the smaller plan would leave over, beside the seats it already counted.
      const preview = await shop.post('/billing/downgrade/preview', { planId: smallPlanId });
      expect(preview.status, JSON.stringify(preview.body)).toBe(201);
      expect(preview.body).toEqual([
        { key: 'products', used: PRODUCTS, limit: 100 },
        { key: 'storage_mb', used: 1, limit: 0 },
      ]);

      const now = new Date();
      await downgradeNow(shop, now);

      // DWN-07, LIM-03: every product stays, in the dashboard and on the public catalogue.
      const listed = await shop.get('/products');
      expect((listed.body as { total: number }).total).toBe(PRODUCTS);
      const { key } = (await shop.post('/api-keys', { name: 'Website', websites: [SITE] }))
        .body as {
        key: string;
      };
      expect(await publicCount(key)).toBe(PRODUCTS);
      // A new one is refused until the shop is within its limit.
      const refused = await shop.post('/products', { name: 'One more', basePrice: 100 });
      expect(refused.status).toBe(402);
      expect(errorOf(refused).details).toMatchObject({ metric: 'products', products: 100 });

      // DWN-09: the photo is still there; a new upload is refused.
      const library = (await shop.get('/media')).body as {
        media: { id: string; status: string }[];
      };
      expect(library.media).toContainEqual(
        expect.objectContaining({ id: photo.id, status: 'ready' }),
      );
      expect((await uploadPhoto(shop)).status).toBe(402);

      // DWN-12: the checklist, counting down 30 days.
      const checklist = await checklistOf(shop);
      expect(checklist?.items).toEqual([
        { key: 'products', used: PRODUCTS, limit: 100, fixed: false },
        { key: 'storage_mb', used: 1, limit: 0, fixed: false },
      ]);
      expect(new Date(checklist?.endsAt ?? 0).getTime()).toBe(
        new Date(checklist?.downgradedAt ?? 0).getTime() + 30 * DAY_MS,
      );
      expect(checklist?.finalWarningAt).toBeNull();
    }, 300_000);

    it('ticks a limit off once the shop is within it, and warns once, after 30 days, of what is still over', async () => {
      const shop = await openShop(port, texts, 'downgrade-fix');
      await onLargePlan(shop);
      const email = `${shop.slug}@example.com`;
      await admin.query('UPDATE tenant.users SET email = $2 WHERE tenant_id = $1 AND is_owner', [
        shop.tenantId,
        email,
      ]);
      expect((await uploadPhoto(shop)).status).toBe(201);
      for (let index = 1; index <= 3; index += 1) {
        expect(
          (await shop.post('/products', { name: `P${String(index)}`, basePrice: 100 })).status,
        ).toBe(201);
      }
      await override(shop, 'products', 2);
      const now = new Date();
      await downgradeNow(shop, now);
      expect((await checklistOf(shop))?.items.map((item) => [item.key, item.fixed])).toEqual([
        ['products', false],
        ['storage_mb', false],
      ]);

      // The products are fixed (here by the operator's override); the storage is not.
      await override(shop, 'products', 10);
      expect((await checklistOf(shop))?.items.map((item) => [item.key, item.fixed])).toEqual([
        ['products', true],
        ['storage_mb', false],
      ]);

      // DWN-14: nothing before the 30 days; then one warning, naming only what is still over.
      const service = app.get(DowngradeService);
      const mailsTo = () =>
        admin.query<{ subject: string; body: string }>(
          `SELECT subject, body FROM control.mail_outbox WHERE to_email = $1 AND kind = 'lifecycle_notice'`,
          [email],
        );
      await service.sendFinalWarnings(new Date(now.getTime() + 29 * DAY_MS));
      expect((await mailsTo()).rows).toEqual([]);
      const later = new Date(now.getTime() + 31 * DAY_MS);
      await service.sendFinalWarnings(later);
      await service.sendFinalWarnings(later);
      const mails = await mailsTo();
      expect(mails.rows).toHaveLength(1);
      expect(mails.rows[0]?.subject).toBe("Your shop is still over its plan's limits");
      expect(mails.rows[0]?.body).toContain('still over its limits: 1 of 0 MB of storage.');
      expect(mails.rows[0]?.body).toContain('Nothing has been deleted or hidden');
      expect(mails.rows[0]?.body).toContain(
        "download all of your shop's data from Settings, Export",
      );
      expect((await checklistOf(shop))?.finalWarningAt).not.toBeNull();

      // Past the 30 days with everything fixed, the checklist is gone.
      await override(shop, 'storage_mb', 100);
      expect(await service.checklist(shop.tenantId, later)).toBeNull();
    });

    it('leaves no checklist when the smaller plan still fits, and a new plan clears an old one', async () => {
      const fits = await openShop(port, texts, 'downgrade-fits');
      await onLargePlan(fits);
      await downgradeNow(fits, new Date());
      expect(await checklistOf(fits)).toBeNull();

      const over = await openShop(port, texts, 'downgrade-then-buy');
      await onLargePlan(over);
      expect((await uploadPhoto(over)).status).toBe(201);
      await downgradeNow(over, new Date());
      expect((await checklistOf(over))?.items).toHaveLength(1);
      // Any plan assignment after it -- here back onto the large plan, as a purchase writes it -- starts afresh.
      const tenants = app.get(TenantService);
      await tenants.runStandalone((tx) =>
        tenants.applyPlanAssignment(tx, over.tenantId, {
          planId: largePlanId,
          planSnapshot: { products: 1000, staff: 5, storage_mb: 1000 },
          planVersionSnapshot: 1,
          featureSnapshot: {},
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 30 * DAY_MS),
          state: TenantState.Active,
        }),
      );
      expect(await checklistOf(over)).toBeNull();
    });
  },
);
