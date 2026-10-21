import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UsageMetric } from '@lytronix/validators';
import pg from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { GB } from '../src/modules/media/services/media-bandwidth';
import { MB } from '../src/modules/media/services/media-limits';
import { MediaProcessor } from '../src/modules/media/services/media-processor';
import { MEDIA_STORAGE } from '../src/modules/media/tokens';
import { DatabaseService } from '../src/database/database.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { EssentialSmsUsageService } from '../src/modules/sms-usage/services/essential-sms-usage.service';
import { UsageNoticeSender } from '../src/modules/usage/services/usage-notice-sender';
import type { UsageNotice } from '../src/modules/usage-warnings/types/usage-notice';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { MemoryStorage } from './support/memory-storage';
import { errorOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 10: the usage warnings. Each use of a limit -- a product, a seat, a file's storage, a counted SMS -- is
// warned of at 50, 80 and 95 percent once a cycle, queued with the write that crossed it; a refusal at a limit names
// the cheapest fix; and the queued notice is written and sent -- by email, by SMS where agreed, to the operators for
// a fast hour. LIM-01, TRL-03, RTE-12. The job queue's relay does not run in tests, so the notices are read where they
// wait and sent as the worker would. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_usage_warnings_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

interface Started {
  media: { id: string };
  upload: { url: string };
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const storage = new MemoryStorage();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'usage-warnings-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  // The plans for sale, priced by the month, as the operator would (BIL-01): the seeded Starter, and a Growth (2.1).
  await admin.query(
    `INSERT INTO control.plans (name, rank, for_sale, limits) VALUES ('Growth', 2, true,
       '{"staff": 5, "products": 1000, "storage_mb": 5120, "bandwidth_gb": 100, "requests_monthly": 600000,
         "essential_sms_monthly": 15, "activity_retention_days": 90}')`,
  );
  const term = await admin.query<{ id: string }>(
    `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
     VALUES ('মাস', '1-month', 1, true, 0) RETURNING id`,
  );
  await admin.query(
    `INSERT INTO control.plan_prices (plan_id, billing_term_id, price)
     SELECT id, $1, CASE name WHEN 'Starter' THEN 449 ELSE 699 END
     FROM control.plans WHERE name IN ('Starter', 'Growth')`,
    [term.rows[0]?.id],
  );
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

/** The usage notices queued for a shop, in order, as the worker would receive them. */
async function queued(tenantId: string): Promise<UsageNotice[]> {
  const rows = await admin.query<{ payload: UsageNotice }>(
    `SELECT payload FROM control.job_outbox
     WHERE queue_name = 'usage_notice' AND payload->>'tenantId' = $1 ORDER BY id`,
    [tenantId],
  );
  return rows.rows.map((row) => row.payload);
}

async function levels(tenantId: string, metric: UsageMetric): Promise<unknown[]> {
  return (await queued(tenantId)).filter((n) => n.metric === metric).map((n) => n.level);
}

async function product(shop: ShopClient, name: string): Promise<number> {
  return (await shop.post('/products', { name, basePrice: 100 })).status;
}

async function owner(shop: ShopClient): Promise<{ phone: string }> {
  const rows = await admin.query<{ phone: string }>(
    'SELECT phone FROM tenant.users WHERE tenant_id = $1 AND is_owner',
    [shop.tenantId],
  );
  return { phone: rows.rows[0]?.phone ?? '' };
}

async function giveOwnerEmail(shop: ShopClient): Promise<string> {
  const email = `${shop.slug}@example.com`;
  await admin.query('UPDATE tenant.users SET email = $2 WHERE tenant_id = $1 AND is_owner', [
    shop.tenantId,
    email,
  ]);
  return email;
}

async function mailTo(email: string): Promise<{ subject: string; body: string }[]> {
  const rows = await admin.query<{ subject: string; body: string }>(
    `SELECT subject, body FROM control.mail_outbox
     WHERE to_email = $1 AND kind = 'lifecycle_notice' ORDER BY created_at, id`,
    [email],
  );
  return rows.rows;
}

async function textsTo(phone: string): Promise<string[]> {
  const rows = await admin.query<{ body: string }>(
    `SELECT body FROM control.sms_outbox
     WHERE to_phone = $1 AND kind = 'lifecycle_notice' ORDER BY created_at, id`,
    [phone],
  );
  return rows.rows.map((row) => row.body);
}

function override(shop: ShopClient, key: string, value: number): Promise<unknown> {
  return admin.query(
    `INSERT INTO control.plan_limit_overrides (tenant_id, limit_key, value, reason, set_by)
     VALUES ($1, $2, $3, 'usage warnings test', gen_random_uuid())`,
    [shop.tenantId, key, JSON.stringify(value)],
  );
}

function notice(shop: ShopClient, values: Partial<UsageNotice>): UsageNotice {
  return {
    tenantId: shop.tenantId,
    metric: UsageMetric.Bandwidth,
    level: 95,
    used: 0.95 * GB,
    limit: GB,
    cycleStart: new Date().toISOString(),
    ...values,
  };
}

describeIfDatabase('warnings as a limit is used (LIM-01)', () => {
  it('warns of products at 50, 80 and 95 percent once each, with the product that crossed it', async () => {
    const shop = await openShop(port, texts, 'warn-products');
    // A trial holds 20 products (TRL-03).
    for (let index = 1; index <= 9; index += 1)
      expect(await product(shop, `P${String(index)}`)).toBe(201);
    expect(await levels(shop.tenantId, UsageMetric.Products)).toEqual([]);
    expect(await product(shop, 'P10')).toBe(201);
    expect(await levels(shop.tenantId, UsageMetric.Products)).toEqual([50]);
    for (let index = 11; index <= 19; index += 1)
      expect(await product(shop, `P${String(index)}`)).toBe(201);
    expect(await levels(shop.tenantId, UsageMetric.Products)).toEqual([50, 80, 95]);
    expect(await product(shop, 'P20')).toBe(201);
    expect(await levels(shop.tenantId, UsageMetric.Products)).toEqual([50, 80, 95]);

    // The 21st is refused, and names the cheapest plan that leaves every metric clear -- its seat is full too.
    const refused = await shop.post('/products', { name: 'P21', basePrice: 100 });
    expect(refused.status).toBe(402);
    expect(errorOf(refused).details).toMatchObject({
      metric: 'products',
      products: 20,
      suggestions: {
        first: { kind: 'plan', name: 'Starter', price: 449, months: 1 },
        alternative: { kind: 'plan', name: 'Growth', price: 699 },
      },
    });
    // A refused product warns of nothing more.
    expect(await levels(shop.tenantId, UsageMetric.Products)).toEqual([50, 80, 95]);
  });

  it('shows each metric’s level and the suggestions on the usage page', async () => {
    const shop = await openShop(port, texts, 'warn-page');
    const page = (await shop.get('/usage')).body as {
      metrics: { metric: string; level: unknown }[];
      suggestions: { first: { name?: string } } | null;
    };
    // A trial's one seat is the owner's, all in use: room is due.
    expect(page.metrics.find((m) => m.metric === 'seats')?.level).toBe(100);
    expect(page.metrics.find((m) => m.metric === 'products')?.level).toBeNull();
    expect(page.suggestions?.first).toMatchObject({ name: 'Starter' });
  });

  it('warns of a seat as it is taken', async () => {
    const shop = await openShop(port, texts, 'warn-seats');
    // On Starter: two seats, the owner's and this one.
    await staffWith(port, texts, admin, shop, ['products:read']);
    expect(await levels(shop.tenantId, UsageMetric.Seats)).toEqual([95]);
  });

  it("warns of storage as a file's processing takes it past a share", async () => {
    const photo = await sharp(randomBytes(1800 * 1200 * 3), {
      raw: { width: 1800, height: 1200, channels: 3 },
    })
      .jpeg({ quality: 95 })
      .toBuffer();
    /** Starts, sends and finishes an upload; its processing is the step that stores it (MED-03). */
    const send = async (shop: ShopClient): Promise<string> => {
      const started = await shop.post('/media/uploads', {
        kind: 'image',
        contentType: 'image/jpeg',
        bytes: photo.length,
        purpose: 'product_image',
      });
      expect(started.status, JSON.stringify(started.body)).toBe(201);
      const { media, upload: link } = started.body as Started;
      expect(storage.send(link.url, photo, 'image/jpeg')).toBe(200);
      expect((await shop.post(`/media/${media.id}/finish`, {})).status).toBe(201);
      return media.id;
    };
    // What the file stores once processed, on a shop with room to spare.
    const measure = await openShop(port, texts, 'warn-storage-size');
    await app.get(MediaProcessor).process(measure.tenantId, await send(measure));
    const stored = ((await measure.get('/media/usage')).body as { usedBytes: number }).usedBytes;
    expect(stored).toBeGreaterThan(MB / 2);

    // A shop whose limit, in whole MB, the processed file fills to between half and all of it. The upload is started
    // under room for the original, which is larger than what processing keeps.
    const shop = await openShop(port, texts, 'warn-storage');
    await override(shop, 'storage_mb', 100);
    const mediaId = await send(shop);
    const limitMb = Math.floor((2 * stored) / MB);
    await admin.query(
      `UPDATE control.plan_limit_overrides SET value = $2
       WHERE tenant_id = $1 AND limit_key = 'storage_mb'`,
      [shop.tenantId, JSON.stringify(limitMb)],
    );
    await app.get(MediaProcessor).process(shop.tenantId, mediaId);
    const share = (stored * 100) / (limitMb * MB);
    const expected = [50, 80, 95].filter((percent) => share >= percent).slice(-1);
    expect(expected.length).toBe(1);
    expect(await levels(shop.tenantId, UsageMetric.Storage)).toEqual(expected);
  });

  it('warns of the free SMS a sign-in code uses (TRL-03, AUTH-21)', async () => {
    const shop = await openShop(port, texts, 'warn-sms');
    await override(shop, 'essential_sms_total', 2);
    // As the sign-in code's own transaction counts it; the resend wait keeps a second code from being asked here.
    const count = () =>
      app
        .get(DatabaseService)
        .handle.db.transaction((tx) =>
          app.get(EssentialSmsUsageService).recordSigninOtp(tx, shop.tenantId, 'Lytro code 123456'),
        );
    await count();
    expect(await levels(shop.tenantId, UsageMetric.EssentialSmsTotal)).toEqual([50]);
    await count();
    expect(await levels(shop.tenantId, UsageMetric.EssentialSmsTotal)).toEqual([50, 95]);
  });
});

describeIfDatabase('sending a usage notice (LIM-01, RTE-12)', () => {
  it('emails the owner how much is used and what would give room, and never texts of products', async () => {
    const shop = await openShop(port, texts, 'send-products');
    const email = await giveOwnerEmail(shop);
    for (let index = 1; index <= 10; index += 1)
      expect(await product(shop, `P${String(index)}`)).toBe(201);
    for (const queuedNotice of await queued(shop.tenantId)) {
      await app.get(UsageNoticeSender).send(queuedNotice);
    }
    const mails = await mailTo(email);
    expect(mails).toHaveLength(1);
    expect(mails[0]?.subject).toBe(`Shop ${shop.slug}: 50% of your products used`);
    expect(mails[0]?.body).toContain('has used 10 of its 20 products (50%).');
    expect(mails[0]?.body).toContain(
      'For more room: Starter, 449 TK for a month, or Growth, 699 TK for a month.',
    );
    expect(await textsTo((await owner(shop)).phone)).toEqual([]);
  });

  it('texts bandwidth at its limit and stop, and at 95 percent only an owner with no email', async () => {
    const phoneOnly = await openShop(port, texts, 'send-phone-only');
    await app.get(UsageNoticeSender).send(notice(phoneOnly, { level: 95 }));
    const sms = await textsTo((await owner(phoneOnly)).phone);
    expect(sms).toEqual([
      `Lytro: Shop ${phoneOnly.slug} has used 95% of its media bandwidth. Get more room from your dashboard.`,
    ]);

    const withEmail = await openShop(port, texts, 'send-with-email');
    const email = await giveOwnerEmail(withEmail);
    const { phone } = await owner(withEmail);
    await app.get(UsageNoticeSender).send(notice(withEmail, { level: 95 }));
    expect(await textsTo(phone)).toEqual([]);
    await app.get(UsageNoticeSender).send(notice(withEmail, { level: 100, used: GB }));
    await app.get(UsageNoticeSender).send(notice(withEmail, { level: 'stopped', used: 1.2 * GB }));
    expect(await textsTo(phone)).toHaveLength(2);
    const subjects = (await mailTo(email)).map((mail) => mail.subject);
    expect(subjects).toEqual([
      `Shop ${withEmail.slug}: 95% of your media bandwidth used`,
      `Shop ${withEmail.slug}: your media bandwidth is used up`,
      `Shop ${withEmail.slug}: your images and videos have stopped showing`,
    ]);
  });

  it('tells every enrolled operator of a fast hour, and the platform audit log', async () => {
    const shop = await openShop(port, texts, 'send-fast');
    await admin.query(
      `INSERT INTO control.operator_accounts (email, password_hash, two_factor_confirmed_at)
       VALUES ('ops-on@lytro.test', 'x', now()), ('ops-pending@lytro.test', 'x', NULL)`,
    );
    await app.get(UsageNoticeSender).send(
      notice(shop, {
        metric: UsageMetric.Requests,
        level: 'fast_spend',
        used: 1_200,
        limit: 20_000,
      }),
    );
    expect((await mailTo('ops-on@lytro.test')).map((mail) => mail.subject)).toEqual([
      `Fast API spending: ${shop.slug}`,
    ]);
    expect(await mailTo('ops-pending@lytro.test')).toEqual([]);
    const audit = await admin.query<{ summary: unknown }>(
      `SELECT summary FROM control.platform_audit_log
       WHERE action = 'usage_fast_spend_alerted' AND target_id = $1`,
      [shop.tenantId],
    );
    expect(audit.rows).toEqual([{ summary: { requests: 1_200, limit: 20_000, operators: 1 } }]);
    // The fast-spend alert never goes by SMS.
    expect(await textsTo((await owner(shop)).phone)).toEqual([]);
  });
});
