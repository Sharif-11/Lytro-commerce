import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { generate } from 'otplib';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEGRADED_NOTICE } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { cookieFrom, getJson, patchJson, postJson, putJson } from './support/http';
import { errorOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// DAT-38, D9-14 (Phase 9 Slice 9.5's read, the owner's answers 2026-11-13): degraded mode is the operator's switch. On, it
// puts the owner's notice up for every shop, refuses the heavy work (exports, reports, reading orders) and keeps the
// essential (sign-in, orders); off, it takes the notice down and all of it runs again. Runs only with
// DATABASE_TEST_ADMIN_URL.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_degraded_mode_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
vi.setConfig({ testTimeout: 90_000 });

const PASSWORD = 'degraded-operator-9';
let app: INestApplication;
let port: number;
let admin: pg.Client;
let operator: Record<string, string> = {};
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'degraded-mode-e2e-otp-secret-012345678901234';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  operator = await operatorHeaders();
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

async function operatorHeaders(): Promise<Record<string, string>> {
  const email = `operator.${randomUUID().slice(0, 8)}@lytronix.internal`;
  await admin.query(
    'INSERT INTO control.operator_accounts (email, password_hash) VALUES ($1, $2)',
    [email, await hash(PASSWORD, 12)],
  );
  const signedIn = await postJson(port, '/auth/operator/signin', { email, password: PASSWORD });
  expect(signedIn.status, JSON.stringify(signedIn.body)).toBeLessThan(300);
  const code = await generate({ secret: (signedIn.body as { secret: string }).secret });
  const enrolled = await postJson(port, '/auth/operator/enroll', {
    email,
    password: PASSWORD,
    code,
  });
  return {
    cookie: cookieFrom(enrolled),
    'x-csrf-token': (enrolled.body as { csrfToken: string }).csrfToken,
  };
}

const turn = (on: boolean) => putJson(port, '/operator/degraded-mode', { on }, operator);

const NOTICE_TITLES: string[] = [DEGRADED_NOTICE.titleBn, DEGRADED_NOTICE.titleEn];

async function boardTitles(shop: ShopClient): Promise<string[]> {
  const board = await shop.get('/notices');
  expect(board.status, JSON.stringify(board.body)).toBe(200);
  return (board.body as { items: { title: string }[] }).items.map((item) => item.title);
}

/** One takeaway order, the essential work that must keep running. */
async function placeOrder(shop: ShopClient): Promise<number> {
  const made = await shop.post('/products', {
    name: 'Lamp',
    basePrice: 300,
    variants: [{ optionIds: [], openingStock: 20 }],
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const variantId = (made.body as { variants: { id: string }[] }).variants[0]?.id ?? '';
  const order = await postJson(
    port,
    '/orders',
    {
      customerName: 'Rahima Akter',
      phone: texts.freshPhone(),
      fulfilmentType: 'takeaway',
      items: [{ variantId, quantity: 1 }],
    },
    shop.headers({ 'idempotency-key': randomUUID() }),
  );
  return order.status;
}

describeIfDatabase('degraded mode (DAT-38, D9-14)', () => {
  it('on, it tells every shop, refuses the heavy work and keeps sign-in and orders; off, all of it runs again', async () => {
    const before = await getJson(port, '/operator/degraded-mode', operator);
    expect(before.body).toEqual({ on: false, noticeId: null, factor: 2 });

    const on = await turn(true);
    expect(on.status, JSON.stringify(on.body)).toBe(200);
    const { noticeId } = on.body as { on: boolean; noticeId: string | null };
    expect(on.body).toMatchObject({ on: true, factor: 2 });
    expect(noticeId).toEqual(expect.any(String));
    // Turned on again, nothing changes: the same notice stays up.
    expect((await turn(true)).body).toMatchObject({ on: true, noticeId });

    // Sign-in by phone code and opening a shop are essential: they run.
    const shop = await openShop(port, texts, 'degraded');
    expect((await boardTitles(shop)).some((title) => NOTICE_TITLES.includes(title))).toBe(true);
    expect(await placeOrder(shop)).toBe(201);

    // The heavy work waits, with a hint of when to try again.
    const exported = await shop.post('/exports', {});
    expect(exported.status, JSON.stringify(exported.body)).toBe(503);
    expect(errorOf(exported).code).toBe('service_unavailable');
    expect(exported.headers['retry-after']).toBe('300');
    const report = await getJson(port, '/operator/reports/revenue', operator);
    expect(report.status, JSON.stringify(report.body)).toBe(503);

    // The switch is only its own: the settings route would leave the shops untold.
    const sideways = await patchJson(
      port,
      '/operator/settings/degraded_mode',
      { value: false, reason: 'Turning it off from the settings' },
      operator,
    );
    expect(sideways.status, JSON.stringify(sideways.body)).toBe(409);

    const off = await turn(false);
    expect(off.body).toEqual({ on: false, noticeId: null, factor: 2 });
    expect((await boardTitles(shop)).some((title) => NOTICE_TITLES.includes(title))).toBe(false);
    expect((await shop.post('/exports', {})).status).not.toBe(503);
    expect((await getJson(port, '/operator/reports/revenue', operator)).status).toBe(200);

    // Each change is in the platform audit log: on (then its notice), and off.
    const audited = await admin.query<{ summary: { newValue: { on: boolean } } }>(
      "SELECT summary FROM control.platform_audit_log WHERE action = 'settings_changed' AND summary->>'key' = 'degraded_mode' ORDER BY created_at",
    );
    expect(audited.rows.map((row) => row.summary.newValue.on)).toEqual([true, true, false]);
  });

  it('shows shops a banner, not an email: the summary says limited mode is on, the notice is a plain one (Slice 9.9)', async () => {
    const shop = await openShop(port, texts, 'limited');
    const ownerEmail = `owner.${randomUUID().slice(0, 8)}@example.com`;
    await admin.query(
      "UPDATE tenant.users SET email = $2, language = 'en' WHERE tenant_id = $1 AND is_owner",
      [shop.tenantId, ownerEmail],
    );
    const summary = async (): Promise<{
      limitedMode: boolean;
      savingPaused: boolean;
      prompts: unknown[];
    }> => {
      const read = await shop.get('/notices/summary');
      expect(read.status, JSON.stringify(read.body)).toBe(200);
      return read.body as { limitedMode: boolean; savingPaused: boolean; prompts: unknown[] };
    };
    expect(await summary()).toMatchObject({ limitedMode: false, savingPaused: false });

    expect((await turn(true)).status).toBe(200);
    // The banner reads the switch; the notice stays on the board but asks nobody and emails nobody.
    expect(await summary()).toMatchObject({ limitedMode: true, savingPaused: false, prompts: [] });
    const notice = await admin.query<{ severity: string }>(
      'SELECT n.severity FROM control.notices n WHERE n.title_en = $1 ORDER BY n.created_at DESC LIMIT 1',
      [DEGRADED_NOTICE.titleEn],
    );
    expect(notice.rows[0]?.severity).toBe('info');
    const mailed = await admin.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM control.mail_outbox WHERE to_email = $1',
      [ownerEmail],
    );
    expect(mailed.rows[0]?.count).toBe(0);

    expect((await turn(false)).status).toBe(200);
    expect(await summary()).toMatchObject({ limitedMode: false });
  });

  it('divides by the factor the operator sets', async () => {
    const set = await patchJson(
      port,
      '/operator/settings/degraded_factor',
      { value: 4, reason: 'A heavier day' },
      operator,
    );
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    const refused = await patchJson(
      port,
      '/operator/settings/degraded_factor',
      { value: 1, reason: 'No change at all' },
      operator,
    );
    expect(refused.status).toBe(400);
    expect((await getJson(port, '/operator/degraded-mode', operator)).body).toMatchObject({
      factor: 4,
    });
  });
});
