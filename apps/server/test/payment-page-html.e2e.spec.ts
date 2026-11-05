import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { postJson, sendExact, type HttpResult } from './support/http';
import { payPage, screenOf, type PayPageAnswer } from './support/pay-page';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Slice 5.8's part 2 (read agreed 2026-11-04): the payment page itself, drawn by the server on its own host, from real
// orders, through its real forms: every state a shopper meets (PAY-05 to PAY-08, PAY-17), its policy (PAY-23), and nothing
// a shop typed becoming markup. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_payment_page_html_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const WEBSITE = 'https://myshop.com';
const RETURN = `${WEBSITE}/thanks`;
const CANCEL = `${WEBSITE}/sorry`;
const PAGE_URL = /^http:\/\/pay\.localhost\/([A-Za-z0-9_-]{22})$/;
// The public API keeps a shop's row a few seconds (api-key-authenticator.ts).
const PAST_SHOP_LOOKUP_MS = 6_100;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'payment-page-html-e2e-otp-secret-0123456789';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
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
});

function raw(
  method: 'GET' | 'POST',
  path: string,
  body: Readonly<Record<string, string>> | null = null,
  host?: string,
): Promise<PayPageAnswer> {
  return payPage(port, method, path, body, host);
}

interface Setup {
  shop: ShopClient;
  key: string;
  variantId: string;
  locationId: number;
}

/** A shop with a bKash account shoppers pay into, a key for its website, and a product needing a 300 TK advance. */
async function payingShop(contactPhone: string | null = '01711000009'): Promise<Setup> {
  const shop = await openShop(port, texts, 'pge');
  const saved = await shop.put('/payment-methods/bkash', {
    enabled: true,
    accounts: [
      {
        accountName: 'Rahim Store',
        number: '01711000001',
        accountType: 'personal',
        active: true,
        note: 'Put the order number as the reference',
      },
    ],
  });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  if (contactPhone !== null) {
    const contact = await shop.patch('/shop-settings', { contactPhone });
    expect(contact.status, JSON.stringify(contact.body)).toBe(200);
  }
  const made = await shop.post('/products', {
    name: 'Saree',
    basePrice: 1000,
    paymentPolicy: 'partial_advance',
    advanceAmount: 300,
    variants: [{ optionIds: [], openingStock: 10 }],
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const key = await shop.post('/api-keys', { name: 'Website', websites: [WEBSITE] });
  const locations = (await shop.get('/locations')).body as {
    zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
  };
  const mirpur = locations.zillas
    .find((row) => row.nameEn === 'Dhaka')
    ?.thanas.find((row) => row.nameEn === 'Mirpur');
  return {
    shop,
    key: (key.body as { key: string }).key,
    variantId: (made.body as { variants: { id: string }[] }).variants[0]?.id ?? '',
    locationId: mirpur?.id ?? 0,
  };
}

/** A shopper's order needing its advance, through the public API; its page's reference. */
async function placed(setup: Setup, method?: string): Promise<string> {
  const answer: HttpResult = await sendExact(
    port,
    'POST',
    '/v1/orders',
    {
      customerName: 'Rahima',
      phone: texts.freshPhone(),
      locationId: setup.locationId,
      deliveryAddress: 'House 12',
      items: [{ variantId: setup.variantId, quantity: 1 }],
      payment: { ...(method ? { method } : {}), returnUrl: RETURN, cancelUrl: CANCEL },
    },
    {
      host: 'api.localhost',
      authorization: `Bearer ${setup.key}`,
      origin: WEBSITE,
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
    },
  );
  expect(answer.status, JSON.stringify(answer.body)).toBe(201);
  const url = (answer.body as { payment: { paymentUrl: string } }).payment.paymentUrl;
  const ref = PAGE_URL.exec(url)?.[1];
  if (!ref) throw new Error(`no payment page in ${url}`);
  return ref;
}

async function sessionIdOf(ref: string): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(
    'SELECT id FROM tenant.payment_sessions WHERE ref = $1',
    [ref],
  );
  return rows[0]?.id ?? '';
}

function freshTrx(): string {
  return randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
}

describeIfDatabase('the page on its own host (PAY-01, PAY-23)', () => {
  it('draws a session in Bangla, under a policy allowing only its own files', async () => {
    const ref = await placed(await payingShop());
    const page = await raw('GET', `/${ref}`);
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(screenOf(page)).toBe('pick');
    expect(page.text).toContain('<html lang="bn"');
    expect(page.text).toContain('মোবাইল ব্যাংকিং');
    expect(page.text).toContain('Secured by Lytro');
    expect(page.text).toContain('এই পেজ কখনো PIN বা OTP চায় না');
    const policy = String(page.headers['content-security-policy']);
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("style-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain('unsafe');
    expect(page.headers['referrer-policy']).toBe('no-referrer');
    expect(page.headers['cache-control']).toBe('no-store');
    // PAY-23: nothing inline for the policy to refuse.
    expect(page.text).not.toMatch(/\sstyle="/);
    expect(page.text).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(page.text).not.toMatch(/\son[a-z]+="/);
  });

  it('serves its own files, and nothing else by that address', async () => {
    const page = await raw('GET', `/${await placed(await payingShop())}`);
    const css = /href="(\/assets\/page\.css\?v=[a-f0-9]+)"/.exec(page.text)?.[1] ?? '';
    const js = /src="(\/assets\/page\.js\?v=[a-f0-9]+)"/.exec(page.text)?.[1] ?? '';
    const sheet = await raw('GET', css);
    expect(sheet.status).toBe(200);
    expect(sheet.headers['content-type']).toContain('text/css');
    expect(sheet.headers['cache-control']).toContain('immutable');
    expect((await raw('GET', js)).headers['content-type']).toContain('javascript');
    expect((await raw('GET', '/assets/bkash.png')).headers['content-type']).toBe('image/png');
    const font = await raw('GET', '/assets/fonts/hind-siliguri-bengali-400-normal.woff2');
    expect(font.status).toBe(200);
    for (const path of [
      '/assets/../package.json',
      '/assets/fonts/LICENSE-hind-siliguri.txt',
      '/assets/nothing.css',
    ]) {
      expect((await raw('GET', path)).status, path).toBe(404);
    }
  });

  it('reaches nothing else on the server from this host', async () => {
    for (const path of ['/', '/api/v1/auth/session', '/health', '/v1/shop', '/a/b/c']) {
      const page = await raw('GET', path);
      expect(page.status, path).toBe(404);
      expect(screenOf(page), path).toBe('missing');
    }
  });

  it("answers only on this host: another host's /api gets nothing", async () => {
    const ref = await placed(await payingShop());
    for (const host of ['app.localhost', 'api.localhost', 'someshop.localhost']) {
      const page = await raw('GET', `/api/v1/pay-page/${ref}`, null, host);
      expect(page.status, host).toBe(404);
      expect(page.text, host).not.toContain('মোবাইল ব্যাংকিং');
      expect((await raw('GET', '/api/v1/pay-assets/page.css', null, host)).status, host).toBe(404);
    }
  });

  it('answers a reference that names nothing as a page, in the language asked', async () => {
    const page = await raw('GET', '/aaaaaaaaaaaaaaaaaaaaaa');
    expect(page.status).toBe(404);
    expect(page.text).toContain('এই পেমেন্ট পেজ পাওয়া যায়নি');
    expect((await raw('GET', '/aaaaaaaaaaaaaaaaaaaaaa?lang=en')).text).toContain(
      'This payment page was not found',
    );
  });

  it('says a page Lytro suspended is closed (TVR-03)', async () => {
    const setup = await payingShop();
    const ref = await placed(setup);
    await admin.query(
      'UPDATE control.tenants SET payment_page_suspended_at = now() WHERE id = $1',
      [setup.shop.tenantId],
    );
    try {
      await new Promise((resolve) => setTimeout(resolve, PAST_SHOP_LOOKUP_MS));
      const page = await raw('GET', `/${ref}`);
      expect(page.status).toBe(403);
      expect(page.text).toContain('এই পেমেন্ট পেজ এখন বন্ধ আছে');
    } finally {
      await admin.query(
        'UPDATE control.tenants SET payment_page_suspended_at = NULL WHERE id = $1',
        [setup.shop.tenantId],
      );
    }
  }, 20_000);
});

describeIfDatabase('what the page shows (PAY-05, PAY-22)', () => {
  it('names the order, and the amount, what it is for and the shop in its details', async () => {
    const ref = await placed(await payingShop());
    const { text } = await raw('GET', `/${ref}`);
    expect(text).toMatch(/অর্ডার \d{6}-\d{4}/);
    expect(text).toContain('পেমেন্ট: 300 টাকা');
    expect(text).toContain('Saree');
    expect(text).toContain('× 1.000');
  });

  it('has WhatsApp and call from the contact phone, and leaves them out with none', async () => {
    const { text } = await raw('GET', `/${await placed(await payingShop('01711000009'))}`);
    expect(text).toContain('https://wa.me/8801711000009');
    expect(text).toContain('tel:01711000009');
    const none = await raw('GET', `/${await placed(await payingShop(null))}`);
    expect(none.text).not.toContain('wa.me');
    expect(none.text).not.toContain('tel:');
  });

  it("opens on a wallet with its number, steps, note, sender box and the shop's own words", async () => {
    const ref = await placed(await payingShop(), 'bkash');
    const page = await raw('GET', `/${ref}`);
    expect(screenOf(page)).toBe('wallet');
    expect(page.text).toContain('data-copy="01711000001"');
    expect(page.text).toContain('*247#');
    expect(page.text).toContain('&quot;Send Money&quot;');
    expect(page.text).toContain('Put the order number as the reference');
    expect(page.text).toContain('name="senderNumber"');
    expect(page.text).toContain('data-expires=');
    expect(page.text).not.toMatch(/name="[^"]*(pin|otp)[^"]*"/i);
    // Its back arrow leads to the picker, which shows every wallet again.
    expect(page.text).toContain(`href="/${ref}?pick=1"`);
    expect(screenOf(await raw('GET', `/${ref}?pick=1`))).toBe('pick');
  });

  it('switches every word to English and keeps the choice through the page (PAY-22)', async () => {
    const ref = await placed(await payingShop(), 'bkash');
    const { text } = await raw('GET', `/${ref}?lang=en`);
    expect(text).toContain('<html lang="en"');
    expect(text).toContain('VERIFY TRANSACTION');
    expect(text).toContain('Enter the transaction ID');
    const form = text.slice(text.indexOf('id="payform"'), text.indexOf('</form>'));
    expect(form).toContain('name="lang" value="en"');
    expect(text).toContain(`href="/${ref}?pick=1&amp;lang=en"`);
    // Nothing of the page's own words left in Bangla, but the link back to it.
    const body = text
      .slice(text.indexOf('<body'))
      .replace(/<a href="[^"]*">বাংলা<\/a>/, '')
      .replace(/৳/g, '');
    expect(body).not.toMatch(/[ঀ-৿]/);
  });

  it('keeps the language through what a form answers (PAY-22)', async () => {
    const ref = await placed(await payingShop(), 'bkash');
    const refused = await raw('POST', `/${ref}/transaction`, {
      method: 'bkash',
      transactionId: 'TX-12',
      lang: 'en',
    });
    expect(refused.text).toContain('Use 6 to 20 letters and digits');
    const typed = await raw('POST', `/${ref}/transaction`, {
      method: 'bkash',
      transactionId: freshTrx(),
      lang: 'en',
    });
    expect(typed.headers.location).toBe(`/${ref}?just=1&lang=en`);
  });

  it('never lets what a shop or a member of staff typed become markup (PAY-23)', async () => {
    const setup = await payingShop();
    const attack = '<script>alert(1)</script>"><img src=x onerror=alert(2)>';
    await setup.shop.put('/payment-methods/bkash', {
      enabled: true,
      accounts: [
        {
          accountName: attack,
          number: '01711000001',
          accountType: 'personal',
          active: true,
          note: attack,
        },
      ],
    });
    const ref = await placed(setup, 'bkash');
    await admin.query('UPDATE control.tenants SET shop_name = $1 WHERE id = $2', [
      attack.slice(0, 60),
      setup.shop.tenantId,
    ]);
    const { text } = await raw('GET', `/${ref}`);
    expect(text).not.toContain('<script>alert');
    expect(text).not.toContain('<img src=x');
    expect(text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    const typed = await raw('POST', `/${ref}/transaction`, {
      method: 'bkash',
      transactionId: attack,
      senderNumber: attack,
    });
    expect(typed.status).toBe(422);
    expect(typed.text).not.toContain('<script>alert');
  });
});

describeIfDatabase('paying (PAY-07, PAY-16, PAY-17)', () => {
  it('takes a typed ID through the plain form, and shows it being checked', async () => {
    const ref = await placed(await payingShop(), 'bkash');
    const id = freshTrx();
    const typed = await raw('POST', `/${ref}/transaction`, {
      method: 'bkash',
      transactionId: id.toLowerCase(),
      senderNumber: '01811000002',
      lang: 'bn',
    });
    expect(typed.status).toBe(303);
    expect(typed.headers.location).toBe(`/${ref}?just=1`);
    const page = await raw('GET', String(typed.headers.location));
    // No phone is paired, so the shop checks.
    expect(screenOf(page)).toBe('manual');
    expect(page.text).toContain(id);
    expect(page.text).toContain('কনফার্ম হলে আপনার অর্ডারের পেজে দেখতে পাবেন');
    expect(page.text).not.toContain('SMS পাবেন');
    expect(page.text).toContain('data-poll="1"');
    expect(page.text).toContain('http-equiv="refresh"');
    const status = await raw('GET', `/${ref}/status`);
    expect(JSON.parse(status.text)).toEqual({ screen: 'manual' });
  });

  it('says what was wrong on the same screen, with it still typed', async () => {
    const ref = await placed(await payingShop(), 'bkash');
    const shape = await raw('POST', `/${ref}/transaction`, {
      method: 'bkash',
      transactionId: 'TX-12',
    });
    expect(shape.status).toBe(422);
    expect(screenOf(shape)).toBe('wallet');
    expect(shape.text).toContain('6 থেকে 20টি অক্ষর বা সংখ্যা দিন');
    expect(shape.text).toContain('value="TX-12"');
    const sender = await raw('POST', `/${ref}/transaction`, {
      method: 'bkash',
      transactionId: freshTrx(),
      senderNumber: '12',
    });
    expect(sender.status).toBe(422);
    expect(sender.text).toContain('মোবাইল নম্বরটি ঠিক করে দিন');
  });

  it('refuses an ID another payment holds in the exact words of PAY-16', async () => {
    const setup = await payingShop();
    const id = freshTrx();
    await admin.query(
      'INSERT INTO control.used_transaction_ids (transaction_id, tenant_id) VALUES ($1, $2)',
      [id, setup.shop.tenantId],
    );
    const second = await placed(setup, 'bkash');
    const refused = await raw('POST', `/${second}/transaction`, {
      method: 'bkash',
      transactionId: id,
    });
    expect(refused.status).toBe(409);
    expect(screenOf(refused)).toBe('wallet');
    expect(refused.text).toContain('এই ট্রান্সেকশন আইডি ইতিমধ্যে ব্যবহৃত হয়েছে');
    expect(refused.text).toContain(`value="${id}"`);
  });

  it('lets the shopper correct a typed ID, until the corrections are used up', async () => {
    const ref = await placed(await payingShop(), 'bkash');
    await raw('POST', `/${ref}/transaction`, { method: 'bkash', transactionId: freshTrx() });
    const form = await raw('GET', `/${ref}?change=1`);
    expect(screenOf(form)).toBe('change');
    expect(form.text).toContain('আরও 3 বার বদলানো যাবে');
    for (let left = 2; left >= 0; left -= 1) {
      const changed = await raw('POST', `/${ref}/change`, { transactionId: freshTrx() });
      expect(changed.status).toBe(303);
      if (left > 0) {
        expect((await raw('GET', `/${ref}?change=1`)).text).toContain(`আরও ${String(left)} বার`);
      }
    }
    const spent = await raw('GET', `/${ref}?change=1`);
    expect(screenOf(spent)).toBe('manual');
    expect((await raw('GET', `/${ref}`)).text).not.toContain('change=1');
    const refused = await raw('POST', `/${ref}/change`, { transactionId: freshTrx() });
    expect(refused.status).toBe(303);
  });

  it('accepts no second payment on a session already waiting', async () => {
    const ref = await placed(await payingShop(), 'bkash');
    await raw('POST', `/${ref}/transaction`, { method: 'bkash', transactionId: freshTrx() });
    const again = await raw('POST', `/${ref}/transaction`, {
      method: 'bkash',
      transactionId: freshTrx(),
    });
    expect(again.status).toBe(303);
    expect(again.headers.location).toBe(`/${ref}`);
  });
});

describeIfDatabase('how it ends (PAY-03, PAY-08, PAY-14)', () => {
  async function typed(): Promise<{ setup: Setup; ref: string; sessionId: string }> {
    const setup = await payingShop();
    const ref = await placed(setup, 'bkash');
    await raw('POST', `/${ref}/transaction`, { method: 'bkash', transactionId: freshTrx() });
    return { setup, ref, sessionId: await sessionIdOf(ref) };
  }

  it('returns to the shop with the session and status once verified, and says so later', async () => {
    const { setup, ref, sessionId } = await typed();
    const verified = await postJson(
      port,
      `/payments/${sessionId}/verify`,
      {},
      setup.shop.headers(),
    );
    expect(verified.status, JSON.stringify(verified.body)).toBe(200);
    const page = await raw('GET', `/${ref}?just=1`);
    expect(screenOf(page)).toBe('verified');
    const { rows } = await admin.query<{ tracking_id: string }>(
      `SELECT o.tracking_id FROM tenant.orders o
       JOIN tenant.payment_sessions s ON s.order_id = o.id WHERE s.ref = $1`,
      [ref],
    );
    const back = `${RETURN}?session_id=${sessionId}&amp;status=verified&amp;tracking_id=${rows[0]?.tracking_id ?? ''}`;
    expect(page.text).toContain(`content="5;url=${back}"`);
    expect(page.text).toContain(`href="${back}"`);
    const later = await raw('GET', `/${ref}`);
    expect(screenOf(later)).toBe('paid');
    expect(later.text).toContain('এই পেমেন্ট আগেই হয়েছে');
    expect(later.text).not.toContain('http-equiv="refresh"');
  });

  it('says a rejected payment cancelled the order, and offers no way to pay again', async () => {
    const { setup, ref, sessionId } = await typed();
    const rejected = await postJson(
      port,
      `/payments/${sessionId}/reject`,
      { reason: 'other', note: '<b>200 taka short</b>' },
      setup.shop.headers(),
    );
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200);
    const page = await raw('GET', `/${ref}`);
    expect(screenOf(page)).toBe('rejected');
    expect(page.text).toContain('&lt;b&gt;200 taka short&lt;/b&gt;');
    expect(page.text).toContain('তাই অর্ডারটি ক্যানসেল হয়েছে');
    expect(page.text).toContain('wa.me');
    expect(page.text).not.toContain('name="transactionId"');
    expect(page.text).toContain('status=failed');
  });

  it('tells a session whose time ran out, with what to do, and takes nothing', async () => {
    const ref = await placed(await payingShop(), 'bkash');
    await admin.query(
      "UPDATE tenant.payment_sessions SET expires_at = now() - interval '1 minute' WHERE ref = $1",
      [ref],
    );
    const page = await raw('GET', `/${ref}`);
    expect(screenOf(page)).toBe('expired');
    expect(page.text).toContain('status=expired');
    const late = await raw('POST', `/${ref}/transaction`, {
      method: 'bkash',
      transactionId: freshTrx(),
    });
    expect(late.status).toBe(303);
    expect(screenOf(await raw('GET', String(late.headers.location)))).toBe('expired');
  });

  it('closes to the cancel address while open (PAY-01)', async () => {
    const { text } = await raw('GET', `/${await placed(await payingShop())}`);
    expect(text).toContain(`href="${CANCEL}"`);
  });

  it("leads a staff link, which has no return address, to the order's tracking page", async () => {
    const setup = await payingShop();
    const ref = await placed(setup, 'bkash');
    await admin.query(
      "UPDATE tenant.payment_sessions SET return_url = NULL, cancel_url = NULL, source = 'staff_link' WHERE ref = $1",
      [ref],
    );
    const { text } = await raw('GET', `/${ref}`);
    const { rows } = await admin.query<{ tracking_id: string }>(
      `SELECT o.tracking_id FROM tenant.orders o
       JOIN tenant.payment_sessions s ON s.order_id = o.id WHERE s.ref = $1`,
      [ref],
    );
    expect(text).toContain(`/track/${rows[0]?.tracking_id ?? ''}"`);
  });
});

describeIfDatabase('reporting the page (TVR-02)', () => {
  it('records a report through the plain form, for Lytro', async () => {
    const ref = await placed(await payingShop());
    const sent = await raw('POST', `/${ref}/report`, { reason: 'asked_for_pin' });
    expect(sent.status).toBe(303);
    expect(sent.headers.location).toBe(`/${ref}?reported=1`);
    expect((await raw('GET', String(sent.headers.location))).text).toContain(
      'রিপোর্ট পাঠানো হয়েছে',
    );
    const { rows } = await admin.query<{ reason: string }>(
      'SELECT reason FROM control.payment_page_reports WHERE ref = $1',
      [ref],
    );
    expect(rows.map((row) => row.reason)).toEqual(['asked_for_pin']);
  });

  it('needs a note with something else, and opens the sheet again saying so', async () => {
    const ref = await placed(await payingShop());
    const refused = await raw('POST', `/${ref}/report`, { reason: 'other', note: '' });
    expect(refused.status).toBe(422);
    expect(refused.text).toContain('scrim open');
    expect(refused.text).toContain('কী হয়েছে তা লিখুন');
    expect(refused.text).toMatch(/id="r-other"[^>]*checked/);
  });
});

describeIfDatabase('a wallet on automated (PAY-06)', () => {
  it("comes back from the wallet's checkout as arriving from paying (PAY-08)", async () => {
    const ref = await placed(await payingShop(), 'bkash');
    const back = await raw(
      'GET',
      `/v1/pay/${ref}/gateway-return?status=cancel`,
      null,
      'api.localhost',
    );
    expect(back.status).toBe(302);
    expect(back.headers.location).toBe(`http://pay.localhost/${ref}?just=1`);
  });

  it('hands on to the wallet, and pays here when there is nowhere to send them', async () => {
    const setup = await payingShop();
    const ref = await placed(setup, 'bkash');
    await admin.query(
      `INSERT INTO tenant.payment_method_ways (tenant_id, method, way) VALUES ($1, 'bkash', 'automated')
       ON CONFLICT (tenant_id, method) DO UPDATE SET way = 'automated'`,
      [setup.shop.tenantId],
    );
    const handing = await raw('GET', `/${ref}`);
    expect(screenOf(handing)).toBe('handing');
    expect(handing.text).toContain(`action="/${ref}/checkout"`);
    expect(handing.text).toContain('data-auto="1"');
    // With no credentials to start one, the shopper carries on here, never blocked.
    const went = await raw('POST', `/${ref}/checkout`, { method: 'bkash' });
    expect(went.status).toBe(303);
    expect(went.headers.location).toBe(`/${ref}?w=bkash&hand=1`);
    expect(screenOf(await raw('GET', String(went.headers.location)))).toBe('wallet');
  });
});
