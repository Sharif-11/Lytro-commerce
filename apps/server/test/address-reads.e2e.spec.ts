import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AddressFieldState,
  AiProvider,
  LedgerEntryType,
  PerUsePaidFrom,
  RateKey,
} from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import type {
  AddressReader,
  ReadDetails,
  ReaderAnswer,
} from '../src/modules/address-reads/ports/address-reader';
import { ADDRESS_READERS } from '../src/modules/address-reads/tokens';
import { BalanceService } from '../src/modules/balance/services/balance.service';
import { PurchaseService } from '../src/modules/billing/services/purchase.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { TenantCache } from '../src/modules/tenancy/services/tenant-cache';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { sendExact, type HttpResult } from './support/http';
import { errorOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 7 Slice 7.6 (read agreed 2026-11-06): reading a customer's delivery details from a pasted message (ORD-30 to
// ORD-34, amended that day: name, phone, zilla, thana, address and a delivery note, nothing else), charged 0.10 TK only
// when it finds a name with a phone or a place, or paid from an address-read allowance (PLN-20: 200 for 20 TK a month).
// A fake stands in for Gemini; the real one is tried in gemini-live.spec.ts. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_address_reads_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
vi.setConfig({ testTimeout: 40_000 });

const NOTHING: ReadDetails = {
  name: null,
  phone: null,
  zilla: null,
  thana: null,
  address: null,
  note: null,
};
const RASHED: ReadDetails = {
  name: 'রাশেদ করিম',
  phone: '০১৭১১-০০০০০১',
  zilla: 'Dhaka',
  thana: 'Dhanmondi',
  address: 'বাসা ১২, রোড ৪',
  note: 'সন্ধ্যার পর দিবেন',
};
const MESSAGE =
  'নাম: রাশেদ করিম\nমোবাইল: ০১৭১১-০০০০০১\nঠিকানা: বাসা ১২, রোড ৪, ধানমন্ডি, ঢাকা। সন্ধ্যার পর দিবেন।';

/** Gemini's stand-in: answers what the test sets, or gives no answer, and keeps what it was asked. */
class FakeReader {
  readonly asked: { text: string; model: string }[] = [];
  next: ReaderAnswer | 'down' = { kind: 'read', details: RASHED };

  readonly reader: AddressReader = {
    read: (text, model) => {
      this.asked.push({ text, model });
      return this.next === 'down'
        ? Promise.reject(new Error('Gemini answered HTTP 503'))
        : Promise.resolve(this.next);
    },
  };
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
let planId = '';
let termId = '';
const texts = new SmsCapture();
const gemini = new FakeReader();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'address-reads-e2e-otp-secret-0123456789012345';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(ADDRESS_READERS)
    .useValue({ [AiProvider.Gemini]: gemini.reader })
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  planId =
    (
      await admin.query<{ id: string }>(
        `INSERT INTO control.plans (name, rank, for_sale, limits) VALUES ('Reads', 960, true, $1) RETURNING id`,
        [JSON.stringify({ products: 100, staff: 3, storage_mb: 100 })],
      )
    ).rows[0]?.id ?? '';
  termId =
    (
      await admin.query<{ id: string }>(
        `INSERT INTO control.billing_terms (label_bn, label_en, months, visible, display_order)
         VALUES ('মাস', 'Reads month', 1, true, 0) RETURNING id`,
      )
    ).rows[0]?.id ?? '';
  await admin.query(
    'INSERT INTO control.plan_prices (plan_id, billing_term_id, price) VALUES ($1, $2, 300)',
    [planId, termId],
  );
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

beforeEach(() => {
  gemini.asked.length = 0;
  gemini.next = { kind: 'read', details: RASHED };
});

interface Read {
  draft: {
    customerName: string | null;
    phone: string | null;
    zillaId: number | null;
    locationId: number | null;
    deliveryAddress: string | null;
    notes: string | null;
  };
  fields: Record<string, AddressFieldState>;
  written: { phone: string | null; zilla: string | null; thana: string | null };
  confidence: number;
  charged: { paidFrom: PerUsePaidFrom; amount: string; allowanceLeft: number | null } | null;
}

/** A trial shop with this much on its balance. */
async function shopWith(balance: string | null): Promise<ShopClient> {
  const shop = await openShop(port, texts, 'reads');
  if (balance !== null) {
    await app.get(BalanceService).creditStandalone({
      tenantId: shop.tenantId,
      amount: balance,
      type: LedgerEntryType.TopUp,
    });
  }
  return shop;
}

/** A shop that bought a paid plan from its balance, so it can buy an allowance. */
async function onPaidPlan(balance: string): Promise<ShopClient> {
  const shop = await shopWith(balance);
  const purchase = app.get(PurchaseService);
  const quote = await purchase.quote(shop.tenantId, planId, termId);
  await purchase.confirmFromBalance(quote.id, shop.tenantId);
  return shop;
}

function read(shop: ShopClient, text = MESSAGE): Promise<HttpResult> {
  return shop.post('/orders/read-address', { text });
}

async function balanceOf(shop: ShopClient): Promise<string> {
  return ((await shop.get('/balance')).body as { amount: string }).amount;
}

async function readsOf(
  shop: ShopClient,
): Promise<
  { input_chars: number; cost: string; paid_from: string; addon_purchase_id: string | null }[]
> {
  return (
    await admin.query<{
      input_chars: number;
      cost: string;
      paid_from: string;
      addon_purchase_id: string | null;
    }>(
      'SELECT input_chars, cost, paid_from, addon_purchase_id FROM tenant.order_extractions WHERE tenant_id = $1 ORDER BY id',
      [shop.tenantId],
    )
  ).rows;
}

let placeIds: Map<string, number> | null = null;
/** Lytro's own ids for a zilla ("Dhaka") and a thana ("Dhaka/Dhanmondi"). */
async function placeId(shop: ShopClient, name: string): Promise<number> {
  if (!placeIds) {
    const { zillas } = (await shop.get('/locations')).body as {
      zillas: { id: number; nameEn: string; thanas: { id: number; nameEn: string }[] }[];
    };
    placeIds = new Map(
      zillas.flatMap((zilla) => [
        [zilla.nameEn, zilla.id] as [string, number],
        ...zilla.thanas.map((thana): [string, number] => [
          `${zilla.nameEn}/${thana.nameEn}`,
          thana.id,
        ]),
      ]),
    );
  }
  return placeIds.get(name) ?? -1;
}

describeIfDatabase('reading delivery details from a pasted message (ORD-30 to ORD-34)', () => {
  it("fills the order form's details, charges 0.10 TK on a trial as on any shop, and keeps no message", async () => {
    const shop = await shopWith('5.00');
    const answer = await read(shop);
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    const body = answer.body as Read;
    expect(body.draft).toEqual({
      customerName: 'রাশেদ করিম',
      phone: '01711000001',
      zillaId: await placeId(shop, 'Dhaka'),
      locationId: await placeId(shop, 'Dhaka/Dhanmondi'),
      deliveryAddress: 'বাসা ১২, রোড ৪',
      notes: 'সন্ধ্যার পর দিবেন',
    });
    expect(Object.values(body.fields).every((state) => state === AddressFieldState.Found)).toBe(
      true,
    );
    expect(body.confidence).toBe(1);
    expect(body.charged).toEqual({
      paidFrom: PerUsePaidFrom.Balance,
      amount: '0.10',
      allowanceLeft: null,
    });
    // AI-10: the operator's model, the owner's pick after the tries.
    expect(gemini.asked).toEqual([{ text: MESSAGE, model: 'gemini-3.5-flash-lite' }]);
    expect(await balanceOf(shop)).toBe('4.90');
    const entry = (
      await admin.query<{ type: string; amount: string; units: string; rate_used: string }>(
        'SELECT type, amount, units, rate_used FROM tenant.balance_ledger WHERE tenant_id = $1 ORDER BY id DESC LIMIT 1',
        [shop.tenantId],
      )
    ).rows[0];
    expect(entry).toEqual({
      type: LedgerEntryType.Extraction,
      amount: '-0.10',
      units: '1.00',
      rate_used: '0.1000',
    });
    // D7-18: only the read's length and how sure it was are kept, never the message.
    expect(await readsOf(shop)).toEqual([
      {
        input_chars: Array.from(MESSAGE).length,
        cost: '0.10',
        paid_from: 'balance',
        addon_purchase_id: null,
      },
    ]);
    const columns = (
      await admin.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'tenant' AND table_name = 'order_extractions'",
      )
    ).rows.map((row) => row.column_name);
    expect(columns.sort()).toEqual(
      [
        'addon_purchase_id',
        'confidence',
        'cost',
        'created_at',
        'id',
        'input_chars',
        'paid_from',
        'tenant_id',
        'user_id',
      ].sort(),
    );
  });

  it('matches an old spelling by its own name, and leaves a place off the list as written', async () => {
    const shop = await shopWith('5.00');
    gemini.next = { kind: 'read', details: { ...RASHED, zilla: 'Comilla', thana: 'Chandina' } };
    const comilla = (await read(shop)).body as Read;
    expect(comilla.draft).toMatchObject({
      zillaId: await placeId(shop, 'Cumilla'),
      locationId: await placeId(shop, 'Cumilla/Chandina'),
    });
    gemini.next = { kind: 'read', details: { ...RASHED, zilla: 'Narayanganj', thana: 'Fatullah' } };
    const fatullah = (await read(shop)).body as Read;
    expect(fatullah.draft).toMatchObject({
      zillaId: await placeId(shop, 'Narayanganj'),
      locationId: null,
    });
    expect(fatullah.fields.thana).toBe(AddressFieldState.Missing);
    expect(fatullah.written.thana).toBe('Fatullah');
    expect(fatullah.confidence).toBe(0.8);
    expect(fatullah.charged?.amount).toBe('0.10');
  });

  it('charges nothing for a read that finds no name with a phone and no place (ORD-34 amended)', async () => {
    const shop = await shopWith('5.00');
    for (const details of [
      NOTHING,
      { ...NOTHING, phone: '01711000001' },
      { ...NOTHING, address: 'House 5' },
    ]) {
      gemini.next = { kind: 'read', details };
      const answer = await read(shop, 'ভাই দাম কত?');
      expect(answer.status).toBe(200);
      expect((answer.body as Read).charged).toBeNull();
    }
    expect(await balanceOf(shop)).toBe('5.00');
    expect(await readsOf(shop)).toEqual([]);
  });

  it("charges nothing when the answer can't be used, or no answer comes (ORD-33)", async () => {
    const shop = await shopWith('5.00');
    gemini.next = { kind: 'unreadable' };
    const unreadable = await read(shop);
    expect(unreadable.status).toBe(503);
    expect(errorOf(unreadable).code).toBe('service_unavailable');
    expect((unreadable.envelope as { message: string }).message).toMatch(/কোনো টাকা কাটা হয়নি/);
    gemini.next = 'down';
    const down = await read(shop);
    expect(down.status).toBe(503);
    expect((down.envelope as { message: string }).message).toMatch(/কোনো টাকা কাটা হয়নি/);
    expect(await balanceOf(shop)).toBe('5.00');
    expect(await readsOf(shop)).toEqual([]);
  });

  it("refuses before asking when the balance can't pay and no allowance is left (BAL-07)", async () => {
    const empty = await shopWith(null);
    const refused = await read(empty);
    expect(refused.status).toBe(429);
    expect(errorOf(refused).code).toBe('quota_exceeded');
    const short = await shopWith('0.05');
    expect((await read(short)).status).toBe(429);
    expect(gemini.asked).toEqual([]);
  });

  it('takes text only, from 1 to 4,000 characters, and refuses a picture by name (ORD-32, ORD-33)', async () => {
    const shop = await shopWith('5.00');
    expect((await read(shop, '   ')).status).toBe(400);
    expect((await read(shop, 'ক'.repeat(4001))).status).toBe(400);
    expect((await read(shop, 'ক'.repeat(4000))).status).toBe(200);
    gemini.asked.length = 0;
    const picture = await shop.post('/orders/read-address', {
      image: 'data:image/png;base64,iVBORw0KGgo=',
    });
    expect(picture.status).toBe(400);
    expect((picture.envelope as { message: string }).message).toMatch(/এখন শুধু লেখা পড়া যায়/);
    for (const type of ['image/png', 'multipart/form-data; boundary=x']) {
      const upload = await sendExact(
        port,
        'POST',
        '/api/v1/orders/read-address',
        { text: MESSAGE },
        shop.headers({ 'content-type': type }),
      );
      expect(upload.status).toBe(400);
      expect((upload.envelope as { message: string }).message).toMatch(/এখন শুধু লেখা পড়া যায়/);
    }
    expect(gemini.asked).toEqual([]);
  });

  it('needs orders:manage, and is closed to a read-only shop (LIF-09)', async () => {
    const shop = await shopWith('5.00');
    const reader = await staffWith(port, texts, admin, shop, ['orders:read']);
    const refused = await sendExact(
      port,
      'POST',
      '/api/v1/orders/read-address',
      { text: MESSAGE },
      reader,
    );
    expect(refused.status).toBe(403);
    await admin.query("UPDATE control.tenants SET state = 'read_only' WHERE id = $1", [
      shop.tenantId,
    ]);
    app.get(TenantCache).invalidateTenant(shop.tenantId);
    const offline = await read(shop);
    expect(offline.status).toBe(403);
    expect(errorOf(offline).code).toBe('tenant_offline');
    expect(gemini.asked).toEqual([]);
  });

  it("holds one shop to 30 reads a minute, and doesn't count the refused one (ORD-33)", async () => {
    const shop = await shopWith('10.00');
    for (let reads = 0; reads < 30; reads += 1) {
      expect((await read(shop)).status).toBe(200);
    }
    const refused = await read(shop);
    expect(refused.status).toBe(429);
    expect(errorOf(refused).code).toBe('rate_limited');
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    expect(gemini.asked).toHaveLength(30);
    const other = await shopWith('1.00');
    expect((await read(other)).status).toBe(200);
  });
});

describeIfDatabase('an address-read allowance (PLN-13, PLN-20, D7-17)', () => {
  async function allowanceId(): Promise<string> {
    return (
      (
        await admin.query<{ id: string }>(
          "SELECT id FROM control.addons WHERE key = 'address_reads_200'",
        )
      ).rows[0]?.id ?? ''
    );
  }

  async function buyAllowance(shop: ShopClient): Promise<string> {
    const quote = await shop.post('/addons/quote', { addonId: await allowanceId(), quantity: 1 });
    expect(quote.status, JSON.stringify(quote.body)).toBe(201);
    const paymentId = (quote.body as { payment: { id: string } }).payment.id;
    const bought = await shop.post('/addons/purchase', { paymentId });
    expect(bought.status, JSON.stringify(bought.body)).toBe(201);
    return (
      (
        await admin.query<{ id: string }>(
          "SELECT id FROM control.addon_purchases WHERE tenant_id = $1 AND kind = 'allowance' AND status = 'active'",
          [shop.tenantId],
        )
      ).rows[0]?.id ?? ''
    );
  }

  it('is offered to a shop in a paid period at 20 TK for 200 reads, and never to a trial or pay-as-you-go', async () => {
    const offer = async (
      shop: ShopClient,
    ): Promise<{ price: number | null; blockedBy: string | null }> => {
      const offers = (await shop.get('/addons')).body as {
        addon: { key: string; unitSize: number; price: string };
        price: number | null;
        blockedBy: string | null;
      }[];
      const found = offers.find((item) => item.addon.key === 'address_reads_200');
      expect(found?.addon.unitSize).toBe(200);
      expect(Number(found?.addon.price)).toBe(20);
      return { price: found?.price ?? null, blockedBy: found?.blockedBy ?? null };
    };
    expect((await offer(await onPaidPlan('500.00'))).blockedBy).toBeNull();
    expect((await offer(await shopWith('500.00'))).blockedBy).toBe('AddonNotAvailable');
    const payg = await shopWith('500.00');
    await admin.query(
      "UPDATE control.tenants SET state = 'pay_as_you_go', period_start = NULL, period_end = NULL WHERE id = $1",
      [payg.tenantId],
    );
    expect((await offer(payg)).blockedBy).toBe('AddonNotAvailable');
    const refused = await payg.post('/addons/quote', { addonId: await allowanceId(), quantity: 1 });
    expect(refused.status).toBe(402);
  });

  it('pays for reads while it has uses, then the balance does, and never refuses for it', async () => {
    const shop = await onPaidPlan('500.00');
    const purchaseId = await buyAllowance(shop);
    const before = await balanceOf(shop);
    const first = (await read(shop)).body as Read;
    expect(first.charged).toEqual({
      paidFrom: PerUsePaidFrom.Allowance,
      amount: '0.00',
      allowanceLeft: 199,
    });
    expect(await balanceOf(shop)).toBe(before);
    // A read that found nothing takes no use either.
    gemini.next = { kind: 'read', details: NOTHING };
    expect(((await read(shop)).body as Read).charged).toBeNull();
    // Down to its last use: one more read takes it, the next is charged at the rate.
    await admin.query('UPDATE control.addon_purchases SET unit_size = 2 WHERE id = $1', [
      purchaseId,
    ]);
    gemini.next = { kind: 'read', details: RASHED };
    const last = (await read(shop)).body as Read;
    expect(last.charged).toEqual({
      paidFrom: PerUsePaidFrom.Allowance,
      amount: '0.00',
      allowanceLeft: 0,
    });
    const after = (await read(shop)).body as Read;
    expect(after.charged).toEqual({
      paidFrom: PerUsePaidFrom.Balance,
      amount: '0.10',
      allowanceLeft: null,
    });
    expect((await readsOf(shop)).map((row) => [row.paid_from, row.addon_purchase_id])).toEqual([
      ['allowance', purchaseId],
      ['allowance', purchaseId],
      ['balance', null],
    ]);
  });

  it('lets a shop with no balance read on its allowance, and two reads at once take a last use once', async () => {
    // 300 TK for the plan and 20 TK for the allowance leave nothing on the balance.
    const shop = await onPaidPlan('320.00');
    const purchaseId = await buyAllowance(shop);
    expect(await balanceOf(shop)).toBe('0.00');
    const first = (await read(shop)).body as Read;
    expect(first.charged?.paidFrom).toBe(PerUsePaidFrom.Allowance);
    // One use left, two reads at once: one takes it, the other finds the balance can't pay.
    await admin.query('UPDATE control.addon_purchases SET unit_size = 2 WHERE id = $1', [
      purchaseId,
    ]);
    const both = await Promise.all([read(shop), read(shop)]);
    expect(both.map((answer) => answer.status).sort()).toEqual([200, 429]);
    expect((await readsOf(shop)).filter((row) => row.paid_from === 'allowance')).toHaveLength(2);
    expect(await balanceOf(shop)).toBe('0.00');
  });
});

describeIfDatabase('the rates a shop is shown (RAT-06, D7-16)', () => {
  it("shows the address-read rate, and not chat's, while chat is out", async () => {
    const shop = await shopWith(null);
    const rates = (await shop.get('/balance/current-rates')).body as {
      key: RateKey;
      value: string;
    }[];
    expect(rates.find((rate) => rate.key === RateKey.AiExtraction)?.value).toBe('0.1000');
    expect(rates.some((rate) => rate.key === RateKey.AiReply)).toBe(false);
  });
});
