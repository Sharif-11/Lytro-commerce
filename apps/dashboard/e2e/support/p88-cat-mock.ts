import type { Page } from '@playwright/test';
import type { CategoryFixture, CategoryStateFixture } from './categories';
import { drawnProducts, type ProductRefusal, type ProductsFixture } from './products';

// Categories by dragging (D8-72, Slice 8.8, Part 39) against a mocked API: the sketch's deeper tree (`P88_CATS`) and
// `POST /categories/:id/move` as the server answers it -- the category with everything under it to a parent and a place,
// both lists renumbered, a fifth level or a move inside itself refused, a place gone meanwhile a 409.

/** The sketch's tree: T-shirts > Men > Formal > Slim fit, T-shirts > Women; Jackets; Sarees; Kids > Baby; Accessories. */
export const P88_CATEGORIES: CategoryFixture[] = [
  ['c-tshirts', null, 'টি-শার্ট', 'T-shirts'],
  ['c-men', 'c-tshirts', 'ছেলেদের', 'Men'],
  ['c-formal', 'c-men', 'ফরমাল', 'Formal'],
  ['c-slim', 'c-formal', 'স্লিম ফিট', 'Slim fit'],
  ['c-women', 'c-tshirts', 'মেয়েদের', 'Women'],
  ['c-jackets', null, 'জ্যাকেট', 'Jackets'],
  ['c-sarees', null, 'শাড়ি', 'Sarees'],
  ['c-kids', null, 'কিডস', 'Kids'],
  ['c-baby', 'c-kids', 'বেবি', 'Baby'],
  ['c-accessories', null, 'অ্যাক্সেসরিজ', 'Accessories'],
];

/** Each row's products as the sketch counts them. */
const P88_COUNTS: Record<string, number> = {
  'c-tshirts': 3,
  'c-men': 2,
  'c-formal': 1,
  'c-slim': 1,
  'c-women': 1,
  'c-jackets': 2,
  'c-sarees': 1,
  'c-kids': 1,
  'c-baby': 1,
  'c-accessories': 1,
};

/** The drawn shop with the sketch's tree. */
export function p88Tree(): ProductsFixture {
  return {
    ...drawnProducts(),
    categories: P88_CATEGORIES.map((each) => [...each] as CategoryFixture),
    categoryState: Object.fromEntries(
      Object.entries(P88_COUNTS).map(([id, productCount]) => [id, { productCount }]),
    ),
  };
}

const CATEGORY_MAX_DEPTH = 4;

const refused = (
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): ProductRefusal => ({ status, code, message, details });

/**
 * POST /categories/:id/move, applied to the fixture's tree as the server applies it; null when moved, a refusal when not.
 * Siblings are taken in the list's own order (their number, else their place in the fixture, then their name).
 */
export function moveCategory(
  tree: CategoryFixture[],
  stateOf: (id: string) => CategoryStateFixture,
  id: string,
  body: Record<string, unknown> | null,
): ProductRefusal | null {
  const parentId = typeof body?.parentId === 'string' ? body.parentId : null;
  const afterId = typeof body?.afterId === 'string' ? body.afterId : null;
  const moving = tree.find((each) => each[0] === id);
  if (!moving) return refused(404, 'not_found', 'Category not found.');
  const parentOf = (of: string) => tree.find((each) => each[0] === of)?.[1] ?? null;
  const gone =
    (parentId !== null && !tree.some((each) => each[0] === parentId)) ||
    (afterId !== null && (afterId === id || parentOf(afterId) !== parentId));
  if (gone) {
    return refused(
      409,
      'conflict',
      'Not moved: someone changed the categories meanwhile. The list is fresh now; try again.',
    );
  }
  const inside = new Set([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const [each, parent] of tree) {
      if (parent !== null && inside.has(parent) && !inside.has(each)) {
        inside.add(each);
        grew = true;
      }
    }
  }
  const depthOf = (of: string | null): number => (of === null ? 0 : 1 + depthOf(parentOf(of)));
  const heightOf = (of: string): number =>
    1 + Math.max(0, ...tree.filter((each) => each[1] === of).map((each) => heightOf(each[0])));
  const field = (message: string) =>
    refused(400, 'validation_error', message, {
      fields: [{ field: 'parentId', problem: 'out_of_range', message }],
    });
  if (parentId !== null && inside.has(parentId)) {
    return field('A category cannot go under itself or one of its own sub-categories.');
  }
  if (depthOf(parentId) + heightOf(id) > CATEGORY_MAX_DEPTH) {
    return field('Categories go up to 4 levels deep. Choose a higher parent.');
  }
  const order = (parent: string | null) =>
    tree
      .map((each, index) => ({ each, index }))
      .filter(({ each }) => each[1] === parent && each[0] !== id)
      .sort(
        (a, b) =>
          (stateOf(a.each[0]).sortOrder ?? a.index) - (stateOf(b.each[0]).sortOrder ?? b.index) ||
          a.each[3].toLowerCase().localeCompare(b.each[3].toLowerCase()),
      )
      .map(({ each }) => each);
  const from = moving[1];
  const target = order(parentId);
  const at = afterId === null ? 0 : target.findIndex((each) => each[0] === afterId) + 1;
  const placed = [...target.slice(0, at), moving, ...target.slice(at)];
  moving[1] = parentId;
  for (const [index, each] of placed.entries()) stateOf(each[0]).sortOrder = index;
  if (from !== parentId) {
    for (const [index, each] of order(from).entries()) stateOf(each[0]).sortOrder = index;
  }
  return null;
}

/** A category's grip, by its name and the page's language. */
export function gripOf(page: Page, name: string) {
  return page
    .getByRole('main')
    .getByRole('button', { name: new RegExp(`^(Drag to move ${name}|${name} সরাতে ধরুন)$`) });
}

/**
 * Picks a category up by its grip, as a seller's mouse does, and holds it over a row `at` of the way down it (0 its top
 * edge, 1 its bottom), the button still down.
 */
export async function holdOver(page: Page, name: string, onto: string, at: number): Promise<void> {
  const from = await gripOf(page, name).boundingBox();
  const to = await page
    .getByRole('main')
    .getByRole('button', { name: new RegExp(`^└?\\s*${onto}`) })
    .first()
    .locator('..')
    .boundingBox();
  if (!from || !to) throw new Error('a row is not on the page');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 240, to.y + to.height * at, { steps: 8 });
}

/** Every move answered 409, as when someone changed the categories meanwhile (`p88-cat-failed`). */
export async function refuseMoves(page: Page): Promise<void> {
  await page.route('**/categories/*/move', (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        statusCode: 409,
        message: 'Not moved.',
        errors: { code: 'conflict', details: {} },
      }),
    }),
  );
}
