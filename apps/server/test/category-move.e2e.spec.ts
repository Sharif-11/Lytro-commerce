import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CATEGORY_MAX_DEPTH } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import type { MessageKey } from '../src/common/i18n/message-key';
import { translate } from '../src/common/i18n/messages';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { errorOf, fieldsOf, openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// D8-72 (Phase 8 Slice 8.8): moving a category in one request, as the dashboard's drag, keyboard, Move up and down and
// Move to… do: to a parent and a place among its sub-categories, both its old and its new siblings renumbered in the
// same transaction. Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_category_move_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'category-move-e2e-otp-secret-0123456789';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: adminDbUrl });
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

interface Category {
  id: string;
  parentId: string | null;
  name: string;
  depth: number;
  sortOrder: number;
}

async function category(shop: ShopClient, name: string, parentId?: string): Promise<Category> {
  const made = await shop.post('/categories', { name, ...(parentId ? { parentId } : {}) });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return made.body as Category;
}

/** Several categories under one parent, numbered in the order given, as the dashboard numbers a new one. */
async function level(shop: ShopClient, names: string[], parentId?: string): Promise<Category[]> {
  const made: Category[] = [];
  for (const [index, name] of names.entries()) {
    const one = await shop.post('/categories', {
      name,
      sortOrder: index,
      ...(parentId ? { parentId } : {}),
    });
    expect(one.status, JSON.stringify(one.body)).toBe(201);
    made.push(one.body as Category);
  }
  return made;
}

function move(shop: ShopClient, id: string, parentId: string | null, afterId: string | null) {
  return shop.post(`/categories/${id}/move`, { parentId, afterId });
}

async function tree(shop: ShopClient): Promise<Category[]> {
  return (await shop.get('/categories')).body as Category[];
}

/** One parent's sub-categories as the list orders them: names with their numbers. */
function under(list: Category[], parentId: string | null): [string, number][] {
  return list
    .filter((each) => each.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((each) => [each.name, each.sortOrder]);
}

/** The refusal's sentence, in either of the two languages the server answers in. */
function says(key: MessageKey, params: Record<string, number> = {}): string[] {
  return [translate(key, 'en', params), translate(key, 'bn', params)];
}

describeIfDatabase('moving a category in one request (D8-72)', () => {
  it('puts a category inside another, last among its sub-categories, and closes the gap it left', async () => {
    const shop = await openShop(port, texts, 'cmv-into');
    const [tees, , kids] = await level(shop, ['T-shirts', 'Jackets', 'Kids']);
    const [, women] = await level(shop, ['Men', 'Women'], tees?.id);
    await category(shop, 'Baby', kids?.id);

    const moved = await move(shop, kids?.id ?? '', tees?.id ?? '', women?.id ?? '');
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    const list = moved.body as Category[];
    expect(under(list, tees?.id ?? '')).toEqual([
      ['Men', 0],
      ['Women', 1],
      ['Kids', 2],
    ]);
    expect(under(list, null)).toEqual([
      ['T-shirts', 0],
      ['Jackets', 1],
    ]);
    // Its sub-categories move with it, a level down.
    const byName = new Map(list.map((each) => [each.name, each]));
    expect(byName.get('Kids')).toMatchObject({ parentId: tees?.id, depth: 2 });
    expect(byName.get('Baby')).toMatchObject({ parentId: kids?.id, depth: 3 });
    // The answer is the list as GET reads it.
    expect(await tree(shop)).toEqual(list);
  });

  it('places a category between two, first, or last, renumbering the level 0 to n-1', async () => {
    const shop = await openShop(port, texts, 'cmv-place');
    const [a, , , d] = await level(shop, ['A', 'B', 'C', 'D']);

    const between = await move(shop, d?.id ?? '', null, a?.id ?? '');
    expect(between.status, JSON.stringify(between.body)).toBe(200);
    expect(under(between.body as Category[], null)).toEqual([
      ['A', 0],
      ['D', 1],
      ['B', 2],
      ['C', 3],
    ]);

    const first = await move(shop, d?.id ?? '', null, null);
    expect(under(first.body as Category[], null)).toEqual([
      ['D', 0],
      ['A', 1],
      ['B', 2],
      ['C', 3],
    ]);

    const c = (first.body as Category[]).find((each) => each.name === 'C');
    const last = await move(shop, d?.id ?? '', null, c?.id ?? '');
    expect(under(last.body as Category[], null)).toEqual([
      ['A', 0],
      ['B', 1],
      ['C', 2],
      ['D', 3],
    ]);
  });

  it('numbers a level never numbered before whole, in the order it showed', async () => {
    const shop = await openShop(port, texts, 'cmv-unnumbered');
    // Each made with no place, so all at 0 and ordered by name, as a shop's first categories are.
    await category(shop, 'Bags');
    const coats = await category(shop, 'Coats');
    await category(shop, 'Aprons');
    const moved = await move(shop, coats.id, null, null);
    expect(under(moved.body as Category[], null)).toEqual([
      ['Coats', 0],
      ['Aprons', 1],
      ['Bags', 2],
    ]);
  });

  it('moves across parents, renumbering both the old and the new list', async () => {
    const shop = await openShop(port, texts, 'cmv-across');
    const [left, right] = await level(shop, ['Left', 'Right']);
    const [, x2] = await level(shop, ['x1', 'x2', 'x3'], left?.id);
    const [y1] = await level(shop, ['y1', 'y2'], right?.id);
    const child = await category(shop, 'x2 child', x2?.id);

    const moved = await move(shop, x2?.id ?? '', right?.id ?? '', y1?.id ?? '');
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    const list = moved.body as Category[];
    expect(under(list, left?.id ?? '')).toEqual([
      ['x1', 0],
      ['x3', 1],
    ]);
    expect(under(list, right?.id ?? '')).toEqual([
      ['y1', 0],
      ['x2', 1],
      ['y2', 2],
    ]);
    expect(list.find((each) => each.id === child.id)).toMatchObject({
      parentId: x2?.id,
      depth: 3,
    });

    // To the top level, the old list closing its gap again.
    const top = await move(shop, x2?.id ?? '', null, left?.id ?? '');
    const after = top.body as Category[];
    expect(under(after, null)).toEqual([
      ['Left', 0],
      ['x2', 1],
      ['Right', 2],
    ]);
    expect(under(after, right?.id ?? '')).toEqual([
      ['y1', 0],
      ['y2', 1],
    ]);
    expect(after.find((each) => each.id === child.id)?.depth).toBe(2);
  });

  it('refuses a fifth level and a move inside itself, as a PATCH does, changing nothing', async () => {
    const shop = await openShop(port, texts, 'cmv-refuse');
    const a = await category(shop, 'A');
    const b = await category(shop, 'B', a.id);
    const c = await category(shop, 'C', b.id);
    const other = await category(shop, 'Other');
    const deep = await category(shop, 'Deep', other.id);
    const deeper = await category(shop, 'Deeper', deep.id);
    const before = await tree(shop);

    // B, with C under it, inside Deeper would reach a fifth level.
    const tooDeep = await move(shop, b.id, deeper.id, null);
    expect(tooDeep.status).toBe(400);
    expect(fieldsOf(tooDeep)).toEqual({ parentId: 'out_of_range' });
    expect(says('CategoryTooDeep', { max: CATEGORY_MAX_DEPTH })).toContain(
      errorOf(tooDeep).message,
    );

    for (const inside of [a.id, c.id]) {
      const refused = await move(shop, a.id, inside, null);
      expect(refused.status).toBe(400);
      expect(fieldsOf(refused)).toEqual({ parentId: 'out_of_range' });
      expect(says('CategoryCannotMoveUnderItself')).toContain(errorOf(refused).message);
    }
    expect(await tree(shop)).toEqual(before);
  });

  it('answers 409 when the place is gone, someone having changed the list meanwhile', async () => {
    const shop = await openShop(port, texts, 'cmv-meanwhile');
    const [a, b, c] = await level(shop, ['A', 'B', 'C']);
    const [b1] = await level(shop, ['b1'], b?.id);
    const gone = await category(shop, 'Gone');
    expect((await shop.delete(`/categories/${gone.id}`)).status).toBe(200);
    const before = await tree(shop);

    const cases: [string | null, string | null][] = [
      // After a category that is no longer under that parent.
      [null, b1?.id ?? ''],
      [a?.id ?? '', b?.id ?? ''],
      // Under a parent that has since been deleted, and after one deleted.
      [gone.id, null],
      [null, gone.id],
      // After itself.
      [null, c?.id ?? ''],
    ];
    for (const [parentId, afterId] of cases) {
      const refused = await move(shop, c?.id ?? '', parentId, afterId);
      expect(refused.status, JSON.stringify({ parentId, afterId })).toBe(409);
      expect(errorOf(refused).code).toBe('conflict');
      expect(says('CategoryMovedMeanwhile')).toContain(errorOf(refused).message);
    }
    expect(await tree(shop)).toEqual(before);
  });

  it("answers 404 for another shop's category, or a parent or place of another shop's", async () => {
    const shop = await openShop(port, texts, 'cmv-own');
    const other = await openShop(port, texts, 'cmv-other');
    const mine = await category(shop, 'Mine');
    const theirs = await category(other, 'Theirs');
    expect((await move(other, mine.id, null, null)).status).toBe(404);
    // Another shop's category as the parent or the place is a place this shop doesn't have.
    expect((await move(shop, mine.id, theirs.id, null)).status).toBe(409);
    expect((await move(shop, mine.id, null, theirs.id)).status).toBe(409);
    expect((await tree(other)).map((each) => each.name)).toEqual(['Theirs']);
  });

  it('refuses what the schema does not take', async () => {
    const shop = await openShop(port, texts, 'cmv-schema');
    const a = await category(shop, 'A');
    const missing = await shop.post(`/categories/${a.id}/move`, { parentId: null });
    expect(missing.status).toBe(400);
    expect(fieldsOf(missing)).toHaveProperty('afterId');
    expect((await move(shop, a.id, 'not-an-id', null)).status).toBe(400);
  });

  it('leaves both lists as they were when a write fails partway, in one transaction', async () => {
    const shop = await openShop(port, texts, 'cmv-atomic');
    const [left, right] = await level(shop, ['Left', 'Right']);
    const [, x2, x3] = await level(shop, ['x1', 'x2', 'x3'], left?.id);
    await level(shop, ['y1', 'y2'], right?.id);
    const before = await tree(shop);

    // The new list is written first; the old list's renumbering then fails on x3, closing the gap.
    await admin.query(`
      CREATE FUNCTION public.p82c_refuse_x3() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.id = '${x3?.id ?? ''}' THEN RAISE EXCEPTION 'refused for the test'; END IF;
        RETURN NEW;
      END $$`);
    await admin.query(
      'CREATE TRIGGER p82c_refuse_x3 BEFORE UPDATE ON tenant.categories FOR EACH ROW EXECUTE FUNCTION public.p82c_refuse_x3()',
    );
    try {
      const failed = await move(shop, x2?.id ?? '', right?.id ?? '', null);
      expect(failed.status).toBe(500);
    } finally {
      await admin.query('DROP TRIGGER p82c_refuse_x3 ON tenant.categories');
      await admin.query('DROP FUNCTION public.p82c_refuse_x3()');
    }
    expect(await tree(shop)).toEqual(before);
  });

  it('takes two moves at once one after the other, every level numbered 0 to n-1', async () => {
    const shop = await openShop(port, texts, 'cmv-race');
    const [a, b, c, d, e] = await level(shop, ['A', 'B', 'C', 'D', 'E']);
    const results = await Promise.all([
      move(shop, e?.id ?? '', null, null),
      move(shop, b?.id ?? '', a?.id ?? '', null),
      move(shop, d?.id ?? '', null, c?.id ?? ''),
    ]);
    for (const result of results) expect(result.status, JSON.stringify(result.body)).toBe(200);
    const list = await tree(shop);
    for (const parentId of [null, a?.id ?? '']) {
      const numbers = under(list, parentId).map(([, sortOrder]) => sortOrder);
      expect(numbers).toEqual(numbers.map((_, index) => index));
    }
    expect(list.find((each) => each.id === b?.id)).toMatchObject({ parentId: a?.id, depth: 2 });
  });
});
