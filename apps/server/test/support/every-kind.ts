import type pg from 'pg';
import { expect } from 'vitest';
import type { HttpResult } from './http';
import type { MemoryStorage } from './memory-storage';
import { PrepaidPath, trx, type PrepaidShop } from './prepaid-path';
import type { SmsCapture } from './sms-capture';

/**
 * Where the rows a dashboard route opens by ID are, by the route's path up to and including the parameter, most specific
 * first (SEC-02's walk and the previous-release check, Slice 9.7). `table` rows carry tenant_id; `sql` reads a shop's
 * rows some other way, with $1 its tenant ID.
 */
export const ID_TARGETS: readonly { path: RegExp; table?: string; sql?: string }[] = [
  { path: /\/orders\/:id\/payments\/:paymentId$/, table: 'tenant.payments' },
  { path: /\/billing\/payments\/:id$/, table: 'control.plan_payments' },
  { path: /\/billing\/invoices\/:id$/, table: 'control.invoices' },
  { path: /\/balance\/top-up\/:id$/, table: 'control.plan_payments' },
  // The payments waiting for staff are named by the session the shopper paid through, not by a recorded payment.
  { path: /\/payments\/:id$/, table: 'tenant.payment_sessions' },
  { path: /\/payment-methods\/accounts\/:id$/, table: 'tenant.wallet_accounts' },
  { path: /\/addons\/mine\/:id$/, table: 'control.addon_purchases' },
  { path: /\/api-keys\/:id$/, table: 'control.api_keys' },
  { path: /\/listener\/devices\/:id$/, table: 'control.listener_devices' },
  { path: /\/attributes\/:id\/options\/:optionId$/, table: 'tenant.attribute_options' },
  { path: /\/attributes\/:id$/, table: 'tenant.attributes' },
  { path: /\/categories\/:id$/, table: 'tenant.categories' },
  { path: /\/customers\/:id$/, table: 'tenant.customers' },
  { path: /\/delivery-zones\/:id$/, table: 'tenant.delivery_zones' },
  { path: /\/exports\/:id$/, table: 'tenant.data_exports' },
  { path: /\/media\/:id$/, table: 'tenant.media' },
  { path: /\/option-sets\/:id$/, table: 'tenant.option_sets' },
  { path: /\/couriers\/payouts\/:id$/, table: 'tenant.courier_payouts' },
  { path: /\/orders\/picker\/:productId$/, table: 'tenant.products' },
  { path: /\/fraud-checks\/orders\/:orderId$/, table: 'tenant.orders' },
  { path: /\/orders\/:id$/, table: 'tenant.orders' },
  { path: /\/products\/:id\/batches\/:batchId$/, table: 'tenant.stock_batches' },
  { path: /\/serials\/:serialId$/, table: 'tenant.serial_numbers' },
  { path: /\/variants\/:variantId$/, table: 'tenant.product_variants' },
  { path: /\/products\/:id$/, table: 'tenant.products' },
  { path: /\/purchase-orders\/:id$/, table: 'tenant.purchase_orders' },
  { path: /\/roles\/:id$/, table: 'tenant.roles' },
  { path: /\/staff\/:id$/, table: 'tenant.users' },
  { path: /\/stock-checks\/:id$/, table: 'tenant.stock_checks' },
  { path: /\/suppliers\/:id$/, table: 'tenant.suppliers' },
  { path: /\/tax-classes\/:id$/, table: 'tenant.tax_classes' },
  {
    path: /\/me\/identities\/:id$/,
    sql: `SELECT i.id FROM control.subscriber_identities i
          JOIN control.tenants t ON t.subscriber_id = i.subscriber_id WHERE t.id = $1 ORDER BY i.id`,
  },
  {
    path: /\/notices\/:id$/,
    sql: `SELECT id FROM control.notices WHERE audience->>'tenantId' = $1::text ORDER BY id`,
  },
];

/** A shop a walk calls as, with what a body may have to name of its own. */
export interface Caller extends PrepaidShop {
  /** A screenshot this shop uploaded: the evidence routes keep the file before they look for the payment. */
  evidenceKey: string;
}

/** The smallest file the evidence store reads as a JPEG. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

/** A create call's answer, which must have succeeded. */
function made(result: HttpResult): unknown {
  expect([200, 201], JSON.stringify(result.body)).toContain(result.status);
  return result.body;
}

/**
 * A shop holding one or more of every kind of row a dashboard route opens by ID, each in a state its routes open:
 * made through the dashboard where a call makes it, by SQL where only Lytro or a courier would. The application under
 * test must keep uploads in `storage` (MEDIA_STORAGE), where a screenshot can be put.
 */
export class EveryKind {
  private readonly path: PrepaidPath;

  constructor(
    port: number,
    private readonly admin: pg.Client,
    private readonly texts: SmsCapture,
    private readonly storage: MemoryStorage,
    storefrontSecret: string,
  ) {
    this.path = new PrepaidPath(port, admin, texts, storefrontSecret);
  }

  /** An open shop with a product and a wallet, and a screenshot of its own in the store. */
  async caller(prefix: string): Promise<Caller> {
    const setup = await this.path.shop(prefix);
    const started = made(
      await setup.shop.post('/billing/payment-evidence', {
        contentType: 'image/jpeg',
        bytes: JPEG.length,
      }),
    ) as { key: string; upload: { url: string } };
    expect(this.storage.send(started.upload.url, JPEG, 'image/jpeg')).toBe(200);
    return { ...setup, evidenceKey: started.key };
  }

  /**
   * Fills a shop with every kind. It keeps three products of one variant each, so three rows of a kind always include a
   * serial's and a batch's own product.
   */
  async seed(setup: Caller): Promise<void> {
    const { admin, path, texts } = this;
    const shop = setup.shop;
    const tenantId = shop.tenantId;
    const order = await path.landingOrder(setup);
    // A payment staff took, and one the shopper sent that waits to be verified.
    made(await shop.post(`/orders/${order.orderId}/payments`, { method: 'cash', amount: 100 }));
    made(await path.typeId(order.ref, trx()));
    await path.pairPhone(shop);
    // The order's customer signed up on the storefront, so staff may set their password.
    await admin.query(
      `INSERT INTO tenant.shoppers (tenant_id, phone, name, password_hash)
       SELECT tenant_id, phone, 'Rahima Akter', 'not-a-hash' FROM tenant.customers WHERE tenant_id = $1`,
      [tenantId],
    );

    made(await shop.post('/categories', { name: 'Shirts' }));
    made(await shop.post('/option-sets', { name: 'Sizes', options: ['S', 'M'] }));
    const thread = made(
      await shop.post('/attributes', { name: 'Thread', dataType: 'enum_single' }),
    ) as { id: string };
    made(await shop.post(`/attributes/${thread.id}/options`, { value: 'Silk' }));
    const role = made(
      await shop.post('/roles', { name: 'Packer', permissions: ['products:manage'] }),
    ) as { id: string };
    // A staff member beside the owner, whom the staff routes may change.
    made(
      await shop.post('/staff', {
        phone: texts.freshPhone(),
        password: 'staff-pass-2468',
        roleIds: [role.id],
      }),
    );
    made(await shop.post('/tax-classes', { name: 'VAT', rate: 5 }));
    const supplier = made(await shop.post('/suppliers', { name: 'Rahim Traders' })) as {
      id: string;
    };
    made(
      await shop.post('/purchase-orders', {
        supplierId: supplier.id,
        items: [{ variantId: setup.variantId, quantity: 5 }],
      }),
    );
    made(
      await shop.post('/stock-checks', { lines: [{ variantId: setup.variantId, counted: 10 }] }),
    );
    made(
      await shop.post('/products', {
        name: 'Phone',
        basePrice: 100,
        serialTracked: true,
        variants: [{ optionIds: [], openingStock: 1, openingSerials: ['SN-SEED-1'] }],
      }),
    );
    made(
      await shop.post('/products', {
        name: 'Face cream',
        basePrice: 100,
        batchTracked: true,
        variants: [{ optionIds: [], openingStock: 2, openingBatch: { batchCode: 'L1' } }],
      }),
    );
    made(
      await shop.post('/media/uploads', {
        kind: 'image',
        contentType: 'image/png',
        bytes: 100,
        purpose: 'product_image',
      }),
    );

    // Lytro's side of the shop: a plan payment and a top-up nothing was sent for yet, an invoice, a running add-on.
    await admin.query(
      `INSERT INTO control.plan_payments (tenant_id, kind, amount)
       VALUES ($1, 'purchase', 899), ($1, 'top_up', 500)`,
      [tenantId],
    );
    // With a line: the invoice list reads its lines' kinds too.
    await admin.query(
      `WITH invoice AS (
         INSERT INTO control.invoices (tenant_id, number, kind, amount) VALUES ($1, $2, 'top_up', 500) RETURNING id
       )
       INSERT INTO control.invoice_lines (invoice_id, position, kind, description, amount)
       SELECT id, 1, 'top_up', 'Balance top-up', 500 FROM invoice`,
      [tenantId, 9_000_000 + Math.floor(Math.random() * 900_000)],
    );
    // The seat carries its add-on's limit and size, as buying one copies them: every read of the shop's limits sums them.
    await admin.query(
      `INSERT INTO control.addon_purchases
         (tenant_id, addon_id, kind, limit_key, unit_size, price, status, paid_from, starts_at, expires_at)
       SELECT $1, id, kind, limit_key, unit_size, price, 'active', 'balance', now() - interval '1 day',
              now() + interval '30 days'
       FROM control.addons WHERE key = 'extra_seat'`,
      [tenantId],
    );
    // A notice for this shop alone, live now, asking the owner to acknowledge it.
    await admin.query(
      `INSERT INTO control.notices
         (category, severity, audience, requires_ack, title_en, body_en, created_by, publish_at)
       VALUES ('general', 'important', jsonb_build_object('kind', 'tenant', 'tenantId', $1::text), true,
               'Notice', 'For this shop.', gen_random_uuid(), now() - interval '1 minute')`,
      [tenantId],
    );
    // A courier's payout, as reading its statement records it, and an export ready to download.
    await admin.query(
      `INSERT INTO tenant.courier_payouts (tenant_id, courier_key, payout_id, amount, paid_at)
       VALUES ($1, 'steadfast', 'PO-1', 500, now())`,
      [tenantId],
    );
    await admin.query(
      `INSERT INTO tenant.data_exports
         (tenant_id, status, file_content, file_size_bytes, content_type, ready_at, expires_at)
       VALUES ($1, 'ready', '\\x504b0506', 4, 'application/zip', now(), now() + interval '1 day')`,
      [tenantId],
    );
  }

  /** A shop's rows behind one ID parameter, at most `limit` of them, or why there are none. */
  async idsFor(pathUpTo: string, tenantId: string, limit: number): Promise<string[] | string> {
    const target = ID_TARGETS.find((each) => each.path.test(pathUpTo));
    if (!target) return `no ID_TARGETS entry says which table ${pathUpTo} opens`;
    const query =
      target.sql ?? `SELECT id FROM ${target.table ?? ''} WHERE tenant_id = $1 ORDER BY id`;
    const { rows } = await this.admin.query<{ id: string }>(`${query} LIMIT ${String(limit)}`, [
      tenantId,
    ]);
    if (rows.length === 0) return `the shop has no row behind ${pathUpTo} to send`;
    return rows.map((row) => row.id);
  }
}
