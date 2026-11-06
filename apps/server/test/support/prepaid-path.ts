import { randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { expect } from 'vitest';
import { seedBalance } from './database';
import { sendExact, type HttpResult } from './http';
import { openShop, type ShopClient } from './shop-client';
import type { SmsCapture } from './sms-capture';

/** The shop's active bKash number, and one switched off that the page must never show. */
export const ACTIVE_NUMBER = '01711000001';
export const OLD_NUMBER = '01711000007';
/** The shopper's own bKash number, as a receipt names it. */
export const SENDER_NUMBER = '01811000002';

const PAGE_URL = /^http:\/\/pay\.localhost\/([A-Za-z0-9_-]{22})$/;
const APP_VERSION = '1.0.0';

export interface PrepaidShop {
  shop: ShopClient;
  productId: string;
  variantId: string;
  locationId: number;
  /** The active bKash account's id. */
  accountId: string;
}

export interface PlacedOrder {
  /** The payment page's reference. */
  ref: string;
  orderId: string;
  sessionId: string;
}

/** A listener phone, paired and online: the headers it sends with. */
export interface PairedPhone {
  headers: Record<string, string>;
}

/** A transaction ID of the shape bKash gives. */
export function trx(): string {
  return randomBytes(5).toString('hex').toUpperCase();
}

/** bKash's receipt for money reaching the shop's account. */
export function receiptOf(transactionId: string, amount = '300.00'): Record<string, string> {
  return {
    sender: 'bKash',
    text: `You have received Tk ${amount} from ${SENDER_NUMBER}. Fee Tk 0.00. Balance Tk 1,300.00. TrxID ${transactionId} at 05/11/2026 13:58`,
    receivedAt: new Date().toISOString(),
  };
}

/**
 * PHASE-5-PLAN §1's prepaid path, for the tests that walk it: a clothing shop past its trial with 100 TK of balance, a shirt
 * needing a 300 TK advance and bKash taken; its landing-page orders; its paired phones. Needs the server started with
 * STOREFRONT_SECRET set to `storefrontSecret`.
 */
export class PrepaidPath {
  constructor(
    private readonly port: number,
    private readonly admin: pg.Client,
    private readonly texts: SmsCapture,
    private readonly storefrontSecret: string,
  ) {}

  async shop(prefix: string): Promise<PrepaidShop> {
    const shop = await openShop(this.port, this.texts, prefix);
    expect((await shop.put('/business-type', { businessType: 'clothing' })).status).toBe(200);
    await this.admin.query(
      `UPDATE control.tenants SET state = 'active',
         plan_snapshot = coalesce(plan_snapshot, '{}'::jsonb) || '{"paired_devices": 5, "staff": 10}'::jsonb
       WHERE id = $1`,
      [shop.tenantId],
    );
    await seedBalance(this.admin, shop.tenantId, '100.00');
    const saved = await shop.put('/payment-methods/bkash', {
      enabled: true,
      accounts: [
        { accountName: 'Old number', number: OLD_NUMBER, accountType: 'personal', active: false },
        {
          accountName: 'Nodi Fashion',
          number: ACTIVE_NUMBER,
          accountType: 'personal',
          active: true,
        },
      ],
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const methods = (await shop.get('/payment-methods')).body as {
      methods: { method: string; accounts: { id: string; number: string }[] }[];
    };
    const accountId =
      methods.methods
        .find((row) => row.method === 'bkash')
        ?.accounts.find((row) => row.number === ACTIVE_NUMBER)?.id ?? '';
    const made = await shop.post('/products', {
      name: 'Cotton shirt',
      basePrice: 1000,
      paymentPolicy: 'partial_advance',
      advanceAmount: 300,
      variants: [{ optionIds: [], openingStock: 10 }],
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const product = made.body as { id: string; variants: { id: string }[] };
    const { zillas } = (await shop.get('/locations')).body as {
      zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
    };
    const mirpur = zillas
      .find((row) => row.nameEn === 'Dhaka')
      ?.thanas.find((row) => row.nameEn === 'Mirpur');
    return {
      shop,
      productId: product.id,
      variantId: product.variants[0]?.id ?? '',
      locationId: mirpur?.id ?? 0,
      accountId,
    };
  }

  /** A landing-page order through the shop's storefront key, as its landing page sends it. */
  async landingOrder(setup: PrepaidShop): Promise<PlacedOrder> {
    const context = await sendExact(
      this.port,
      'GET',
      `/api/v1/internal/storefront/context?host=${encodeURIComponent(`${setup.shop.slug}.localhost`)}`,
      undefined,
      { host: 'localhost', 'x-lytro-storefront': this.storefrontSecret },
    );
    const found = (context.body as { shop: { key: string; origin: string } | null }).shop;
    if (!found) throw new Error('an open shop has a storefront key');
    const made = await sendExact(
      this.port,
      'POST',
      '/v1/orders',
      {
        customerName: 'Rahima Akter',
        phone: this.texts.freshPhone(),
        locationId: setup.locationId,
        deliveryAddress: 'House 12, Road 3',
        source: 'landing_page',
        items: [{ variantId: setup.variantId, quantity: 1 }],
        payment: { method: 'bkash', returnUrl: `${found.origin}/thanks` },
      },
      {
        host: 'api.localhost',
        authorization: `Bearer ${found.key}`,
        origin: found.origin,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
    );
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const url = (made.body as { payment: { paymentUrl: string } | null }).payment?.paymentUrl ?? '';
    const ref = PAGE_URL.exec(url)?.[1];
    if (!ref) throw new Error(`no payment page in ${url}`);
    const { rows } = await this.admin.query<{ id: string; order_id: string }>(
      'SELECT id, order_id FROM tenant.payment_sessions WHERE ref = $1',
      [ref],
    );
    return { ref, orderId: rows[0]?.order_id ?? '', sessionId: rows[0]?.id ?? '' };
  }

  /** The shopper typing a transaction ID on the page, through its JSON route. */
  typeId(ref: string, transactionId: string): Promise<HttpResult> {
    return sendExact(
      this.port,
      'POST',
      `/v1/pay/${ref}/transaction`,
      { method: 'bkash', transactionId, senderNumber: SENDER_NUMBER },
      { host: 'api.localhost', 'content-type': 'application/json' },
    );
  }

  /** A phone paired with the shop's own code, reporting in, so the shop has a phone online (LSN-03). */
  async pairPhone(shop: ShopClient): Promise<PairedPhone> {
    const code = await shop.post('/listener/pairing-codes', {});
    expect(code.status, JSON.stringify(code.body)).toBe(201);
    const installationId = `install-${randomUUID()}`;
    const paired = await sendExact(
      this.port,
      'POST',
      '/v1/listener/pair',
      { code: (code.body as { code: string }).code, installationId, model: 'Redmi 12' },
      { host: 'api.localhost', 'content-type': 'application/json', 'x-app-version': APP_VERSION },
    );
    expect(paired.status, JSON.stringify(paired.body)).toBe(201);
    const headers = {
      host: 'api.localhost',
      authorization: `Bearer ${(paired.body as { token: string }).token}`,
      'x-installation-id': installationId,
      'x-app-version': APP_VERSION,
    };
    const beat = await sendExact(this.port, 'POST', '/v1/listener/heartbeat', undefined, headers);
    expect(beat.status, JSON.stringify(beat.body)).toBe(200);
    return { headers };
  }

  /** The phone forwarding the SMS it read. */
  forward(phone: PairedPhone, receipt: Record<string, string>): Promise<HttpResult> {
    return sendExact(
      this.port,
      'POST',
      '/v1/listener/messages',
      { messages: [receipt] },
      { ...phone.headers, 'content-type': 'application/json' },
    );
  }

  /** The shop's live payments of one transaction ID, in every shop. */
  async paymentsWith(transactionId: string): Promise<{ tenant_id: string; amount: string }[]> {
    const { rows } = await this.admin.query<{ tenant_id: string; amount: string }>(
      `SELECT tenant_id, amount FROM tenant.payments
        WHERE upper(transaction_id) = upper($1) AND voided_at IS NULL AND refunded_at IS NULL`,
      [transactionId],
    );
    return rows;
  }

  /** The verification fees a shop's ledger holds. */
  async feesOf(tenantId: string): Promise<string[]> {
    const { rows } = await this.admin.query<{ amount: string }>(
      "SELECT amount FROM tenant.balance_ledger WHERE tenant_id = $1 AND type = 'verification_fee' ORDER BY created_at",
      [tenantId],
    );
    return rows.map((row) => row.amount);
  }
}
