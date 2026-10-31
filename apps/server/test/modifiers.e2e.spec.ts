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
import { errorOf, fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 4 Slice 4.6b, read agreed 2026-10-30: a product's modifier groups (MNU-01) -- "Spice level", exactly 1;
// "Extras", 0 to 3 -- never on a combo; chosen on an order line by staff and shoppers alike, a group not named taking its
// defaults, each held to its least and most (MNU-03), snapshotted with their price changes already in the unit price
// (MNU-02), never below zero. A price staff set by hand is final; edited choices take today's prices. Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_modifiers_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const SITE = 'https://myshop.com';

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'modifiers-e2e-otp-secret-0123456789abcdefghi';
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

interface Group {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: { id: string; name: string; priceChange: string; isDefault: boolean }[];
}

interface Burger {
  id: string;
  variantId: string;
  groups: Group[];
}

interface Line {
  id: string;
  unitPrice: string;
  itemTotal: string;
  modifiers: { groupName: string; optionName: string; priceChange: string }[];
}

const GROUPS = [
  {
    name: 'Spice level',
    minSelect: 1,
    maxSelect: 1,
    options: [
      { name: 'Mild', priceChange: 0, isDefault: true },
      { name: 'Hot', priceChange: 0 },
      { name: 'Extra hot', priceChange: 10 },
    ],
  },
  {
    name: 'Extras',
    minSelect: 0,
    maxSelect: 3,
    options: [
      { name: 'Cheese', priceChange: 30 },
      { name: 'Egg', priceChange: 20 },
      { name: 'Bacon', priceChange: 40 },
      { name: 'No onion', priceChange: -10 },
    ],
  },
];

async function burger(shop: ShopClient, price = 250, groups: unknown[] = GROUPS): Promise<Burger> {
  const made = await shop.post('/products', {
    name: 'Burger',
    basePrice: price,
    variants: [{ optionIds: [], openingStock: 50 }],
    modifierGroups: groups,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const body = made.body as { id: string; variants: { id: string }[]; modifierGroups: Group[] };
  return { id: body.id, variantId: body.variants[0]?.id ?? '', groups: body.modifierGroups };
}

function option(product: Burger, group: string, name: string): string {
  const found = product.groups
    .find((row) => row.name === group)
    ?.options.find((row) => row.name === name);
  if (!found) throw new Error(`no ${group}/${name}`);
  return found.id;
}

function groupId(product: Burger, name: string): string {
  return product.groups.find((row) => row.name === name)?.id ?? '';
}

function order(shop: ShopClient, items: unknown[]): Promise<HttpResult> {
  return postJson(
    port,
    '/orders',
    { customerName: 'Rahima', phone: texts.freshPhone(), fulfilmentType: 'takeaway', items },
    shop.headers({ 'idempotency-key': randomUUID() }),
  );
}

async function placed(shop: ShopClient, items: unknown[]): Promise<{ id: string; items: Line[] }> {
  const made = await order(shop, items);
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as { id: string; items: Line[] };
}

describeIfDatabase("a product's modifier groups (MNU-01)", () => {
  it('keeps the groups and options in order, each with its price change and default', async () => {
    const shop = await openShop(port, texts, 'mod');
    const made = await burger(shop);
    expect(made.groups.map((group) => [group.name, group.minSelect, group.maxSelect])).toEqual([
      ['Spice level', 1, 1],
      ['Extras', 0, 3],
    ]);
    expect(
      made.groups[1]?.options.map((row) => [row.name, row.priceChange, row.isDefault]),
    ).toEqual([
      ['Cheese', '30.00', false],
      ['Egg', '20.00', false],
      ['Bacon', '40.00', false],
      ['No onion', '-10.00', false],
    ]);
    const replaced = await shop.patch(`/products/${made.id}`, { modifierGroups: [GROUPS[0]] });
    expect(
      (replaced.body as { modifierGroups: Group[] }).modifierGroups.map((row) => row.name),
    ).toEqual(['Spice level']);
    const copy = await shop.post(`/products/${made.id}/duplicate`, {});
    expect(
      (copy.body as { modifierGroups: Group[] }).modifierGroups.map((row) => row.name),
    ).toEqual(['Spice level']);
    const cleared = await shop.patch(`/products/${made.id}`, { modifierGroups: [] });
    expect((cleared.body as { modifierGroups: Group[] }).modifierGroups).toEqual([]);
  });

  it('refuses a group whose least is over its most, whose most is over its options, or with too many defaults', async () => {
    const shop = await openShop(port, texts, 'mod');
    const bad = (group: Record<string, unknown>) =>
      shop.post('/products', {
        name: 'Burger',
        basePrice: 250,
        variants: [{ optionIds: [] }],
        modifierGroups: [
          {
            name: 'G',
            minSelect: 0,
            maxSelect: 1,
            options: [{ name: 'A', priceChange: 0 }],
            ...group,
          },
        ],
      });
    expect(fieldsOf(await bad({ minSelect: 2, maxSelect: 1 }))).toMatchObject({
      'modifierGroups.0.minSelect': 'too_large',
    });
    expect(fieldsOf(await bad({ maxSelect: 2 }))).toMatchObject({
      'modifierGroups.0.maxSelect': 'too_large',
    });
    expect(
      fieldsOf(
        await bad({
          options: [
            { name: 'A', priceChange: 0, isDefault: true },
            { name: 'B', priceChange: 0, isDefault: true },
          ],
        }),
      ),
    ).toMatchObject({ 'modifierGroups.0.options': 'too_many' });
    const eleven = Array.from({ length: 11 }, (_, n) => ({
      name: `G${String(n)}`,
      minSelect: 0,
      maxSelect: 1,
      options: [{ name: 'A', priceChange: 0 }],
    }));
    expect(
      (
        await shop.post('/products', {
          name: 'Burger',
          basePrice: 250,
          variants: [{ optionIds: [] }],
          modifierGroups: eleven,
        })
      ).status,
    ).toBe(400);
  });

  it('never puts modifiers on a combo', async () => {
    const shop = await openShop(port, texts, 'mod');
    const part = await burger(shop, 250, []);
    const combo = {
      name: 'Meal deal',
      basePrice: 300,
      kind: 'combo',
      parts: [{ quantity: 1, variantIds: [part.variantId] }],
    };
    const refused = await shop.post('/products', { ...combo, modifierGroups: [GROUPS[0]] });
    expect(refused.status).toBe(400);
    expect(fieldsOf(refused)).toMatchObject({ modifierGroups: 'not_allowed' });
    const made = await shop.post('/products', combo);
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const later = await shop.patch(`/products/${(made.body as { id: string }).id}`, {
      modifierGroups: [GROUPS[0]],
    });
    expect(fieldsOf(later)).toEqual({ modifierGroups: 'not_allowed' });
  });
});

describeIfDatabase('choosing modifiers on an order (MNU-02, MNU-03)', () => {
  it('prices the choices into the unit price and keeps them on the line', async () => {
    const shop = await openShop(port, texts, 'mod');
    const made = await burger(shop);
    const order = await placed(shop, [
      {
        variantId: made.variantId,
        quantity: 2,
        modifiers: [
          {
            groupId: groupId(made, 'Spice level'),
            optionIds: [option(made, 'Spice level', 'Extra hot')],
          },
          {
            groupId: groupId(made, 'Extras'),
            optionIds: [option(made, 'Extras', 'Cheese'), option(made, 'Extras', 'No onion')],
          },
        ],
      },
    ]);
    const [line] = order.items;
    expect(line).toMatchObject({ unitPrice: '280.00', itemTotal: '560.00' });
    expect(line?.modifiers.map((row) => [row.groupName, row.optionName, row.priceChange])).toEqual([
      ['Spice level', 'Extra hot', '10.00'],
      ['Extras', 'Cheese', '30.00'],
      ['Extras', 'No onion', '-10.00'],
    ]);
  });

  it("takes a group's defaults when the line names nothing of it, and refuses a required group left empty", async () => {
    const shop = await openShop(port, texts, 'mod');
    const made = await burger(shop);
    const plain = await placed(shop, [{ variantId: made.variantId, quantity: 1 }]);
    expect(plain.items[0]?.modifiers.map((row) => row.optionName)).toEqual(['Mild']);
    expect(plain.items[0]?.unitPrice).toBe('250.00');
    const sized = await burger(shop, 250, [
      { name: 'Size', minSelect: 1, maxSelect: 1, options: [{ name: 'Small', priceChange: 0 }] },
    ]);
    const refused = await order(shop, [{ variantId: sized.variantId, quantity: 1 }]);
    expect(refused.status).toBe(400);
    expect(fieldsOf(refused)).toEqual({ 'items.0.modifiers': 'out_of_range' });
    expect(errorOf(refused).message).toContain('Size');
  });

  it('refuses too many choices, a group or option not of the product, and a price below zero', async () => {
    const shop = await openShop(port, texts, 'mod');
    const made = await burger(shop);
    const extras = groupId(made, 'Extras');
    const every =
      made.groups.find((row) => row.name === 'Extras')?.options.map((row) => row.id) ?? [];
    const tooMany = await order(shop, [
      {
        variantId: made.variantId,
        quantity: 1,
        modifiers: [{ groupId: extras, optionIds: every }],
      },
    ]);
    expect(fieldsOf(tooMany)).toEqual({ 'items.0.modifiers': 'out_of_range' });
    const strange = await order(shop, [
      {
        variantId: made.variantId,
        quantity: 1,
        modifiers: [{ groupId: randomUUID(), optionIds: [] }],
      },
    ]);
    expect(fieldsOf(strange)).toEqual({ 'items.0.modifiers.0.groupId': 'not_found' });
    const wrongOption = await order(shop, [
      {
        variantId: made.variantId,
        quantity: 1,
        modifiers: [{ groupId: extras, optionIds: [option(made, 'Spice level', 'Hot')] }],
      },
    ]);
    expect(fieldsOf(wrongOption)).toEqual({ 'items.0.modifiers.0.optionIds.0': 'not_found' });
    const twice = await order(shop, [
      {
        variantId: made.variantId,
        quantity: 1,
        modifiers: [
          { groupId: extras, optionIds: [option(made, 'Extras', 'Cheese')] },
          { groupId: extras, optionIds: [] },
        ],
      },
    ]);
    expect(fieldsOf(twice)).toEqual({ 'items.0.modifiers.1.groupId': 'not_allowed' });
    const cheap = await burger(shop, 5);
    const below = await order(shop, [
      {
        variantId: cheap.variantId,
        quantity: 1,
        modifiers: [
          { groupId: groupId(cheap, 'Extras'), optionIds: [option(cheap, 'Extras', 'No onion')] },
        ],
      },
    ]);
    expect(fieldsOf(below)).toEqual({ 'items.0.modifiers': 'out_of_range' });
  });

  it('keeps a price staff set by hand, choices and all, and records only that in the history', async () => {
    const shop = await openShop(port, texts, 'mod');
    const made = await burger(shop);
    const cheese = {
      groupId: groupId(made, 'Extras'),
      optionIds: [option(made, 'Extras', 'Cheese')],
    };
    const handSet = await placed(shop, [
      { variantId: made.variantId, quantity: 1, unitPrice: 260, modifiers: [cheese] },
    ]);
    expect(handSet.items[0]).toMatchObject({ unitPrice: '260.00' });
    expect(handSet.items[0]?.modifiers.map((row) => row.optionName)).toEqual(['Mild', 'Cheese']);
    const worked = await placed(shop, [
      { variantId: made.variantId, quantity: 1, modifiers: [cheese] },
    ]);
    const history = async (id: string) =>
      (
        (await shop.get(`/orders/${id}`)).body as {
          history: { field: string; from: string | null; to: string | null }[];
        }
      ).history.filter((row) => row.field === 'unit_price');
    expect(await history(handSet.id)).toEqual([
      expect.objectContaining({ from: '280.00', to: '260.00' }) as unknown,
    ]);
    expect(await history(worked.id)).toEqual([]);
  });

  it("keeps a line's choices and price on an edit, and prices choices sent again at today's prices", async () => {
    const shop = await openShop(port, texts, 'mod');
    const made = await burger(shop);
    const cheese = {
      groupId: groupId(made, 'Extras'),
      optionIds: [option(made, 'Extras', 'Cheese')],
    };
    const ordered = await placed(shop, [
      { variantId: made.variantId, quantity: 1, modifiers: [cheese] },
    ]);
    expect(ordered.items[0]?.unitPrice).toBe('280.00');
    const dearer = GROUPS.map((group) =>
      group.name === 'Extras'
        ? {
            ...group,
            options: group.options.map((row) =>
              row.name === 'Cheese' ? { ...row, priceChange: 50 } : row,
            ),
          }
        : group,
    );
    const now = (
      (await shop.patch(`/products/${made.id}`, { modifierGroups: dearer })).body as {
        modifierGroups: Group[];
      }
    ).modifierGroups;
    const line = ordered.items[0]?.id;
    const kept = await shop.patch(`/orders/${ordered.id}`, {
      items: [{ lineId: line, variantId: made.variantId, quantity: 2 }],
    });
    expect((kept.body as { items: Line[] }).items[0]).toMatchObject({
      unitPrice: '280.00',
      itemTotal: '560.00',
    });
    const newCheese = now
      .find((row) => row.name === 'Extras')
      ?.options.find((row) => row.name === 'Cheese')?.id;
    const extrasId = now.find((row) => row.name === 'Extras')?.id;
    const chosen = await shop.patch(`/orders/${ordered.id}`, {
      items: [
        {
          lineId: line,
          variantId: made.variantId,
          quantity: 1,
          modifiers: [{ groupId: extrasId, optionIds: [newCheese] }],
        },
      ],
    });
    expect(chosen.status, JSON.stringify(chosen.body)).toBe(200);
    expect((chosen.body as { items: Line[] }).items[0]).toMatchObject({ unitPrice: '300.00' });
    // Moved by its choices, not by hand: nothing for the history (ORD-06).
    const history = (
      (await shop.get(`/orders/${ordered.id}`)).body as { history: { field: string }[] }
    ).history.filter((row) => row.field === 'unit_price');
    expect(history).toEqual([]);
  });
});

describeIfDatabase('modifiers for shoppers (MNU-02, agreed 2026-10-30)', () => {
  it('shows the groups on the public product, takes the choices on an order, and shows them back', async () => {
    const shop = await openShop(port, texts, 'mod');
    const made = await burger(shop);
    const key = (
      (await shop.post('/api-keys', { name: 'Website', websites: [SITE] })).body as { key: string }
    ).key;
    const headers = { host: 'api.localhost', authorization: `Bearer ${key}`, origin: SITE };
    const slug = ((await shop.get(`/products/${made.id}`)).body as { slug: string }).slug;
    const detail = await sendExact(
      port,
      'GET',
      `/v1/catalogue/products/${encodeURIComponent(slug)}`,
      undefined,
      headers,
    );
    expect(
      (detail.body as { modifierGroups: Group[] }).modifierGroups.map((row) => row.name),
    ).toEqual(['Spice level', 'Extras']);
    const locations = (await shop.get('/locations')).body as {
      zillas: { nameEn: string; thanas: { id: number; nameEn: string }[] }[];
    };
    const mirpur = locations.zillas
      .find((row) => row.nameEn === 'Dhaka')
      ?.thanas.find((row) => row.nameEn === 'Mirpur');
    const placedOnline = await sendExact(
      port,
      'POST',
      '/v1/orders',
      {
        customerName: 'Rahima',
        phone: texts.freshPhone(),
        locationId: mirpur?.id,
        deliveryAddress: 'House 12',
        items: [
          {
            variantId: made.variantId,
            quantity: 1,
            modifiers: [
              { groupId: groupId(made, 'Extras'), optionIds: [option(made, 'Extras', 'Egg')] },
            ],
          },
        ],
      },
      { ...headers, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
    );
    expect(placedOnline.status, JSON.stringify(placedOnline.body)).toBe(201);
    const body = placedOnline.body as { trackingId: string; items: Line[] };
    expect(body.items[0]).toMatchObject({ unitPrice: '270.00' });
    expect(body.items[0]?.modifiers.map((row) => row.optionName)).toEqual(['Mild', 'Egg']);
    const tracked = await sendExact(
      port,
      'GET',
      `/v1/track/${body.trackingId}`,
      undefined,
      headers,
    );
    expect((tracked.body as { items: Line[] }).items[0]?.modifiers).toEqual(
      body.items[0]?.modifiers,
    );
  });
});
