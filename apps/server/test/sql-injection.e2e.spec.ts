import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { postJson } from './support/http';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// SEC-03 (Phase 9 Slice 9.7): user input reaches the database only as a parameter, never as SQL. SQL typed where a phone
// number goes is refused by its shape; typed into a search, it is searched for as text and matches nothing.
const ADMIN = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_sql_injection_test';
const describeIfDatabase = ADMIN ? describe : describe.skip;
const INJECTIONS = ["' OR 1=1 --", "'; DROP TABLE tenant.products; --", '" OR ""="'];

let app: INestApplication | undefined;
let port: number;
let shop: ShopClient;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN) return;
  const urls = await prepareTestDatabase(ADMIN, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'sql-injection-e2e-otp-secret-0123456789ab';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .compile();
  ({ app, port } = await listenOn(moduleRef));
  shop = await openShop(port, texts, 'sqli');
  for (const name of ['Cotton shirt', 'Silk scarf']) {
    const made = await shop.post('/products', {
      name,
      basePrice: 500,
      variants: [{ optionIds: [] }],
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
  }
});

afterAll(async () => {
  await app?.close();
});

describeIfDatabase('SQL typed into the API stays text (SEC-03)', () => {
  it.each(INJECTIONS)('refuses %s as a phone number by its shape', async (phone) => {
    const answer = await postJson(port, '/auth/phone/code', { phone }, { host: 'localhost' });
    expect(answer.status).toBe(400);
    expect(answer.body).toMatchObject({ error: { code: 'validation_error' } });
  });

  it.each(INJECTIONS)(
    'searches for %s as text, finding nothing, and the products stay',
    async (typed) => {
      const found = await shop.get(`/products?search=${encodeURIComponent(typed)}`);
      expect(found.status).toBe(200);
      expect((found.body as { total: number }).total).toBe(0);
      expect(((await shop.get('/products')).body as { total: number }).total).toBe(2);
    },
  );
});
