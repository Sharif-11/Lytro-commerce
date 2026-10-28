import type { Language } from './mock-api';
import type { ProductRefusal, ProductsFixture } from './products';

// Categories against a mocked API (Slice 11.8): the prototype's tree (`CATS`, `CAT_ROWS`), what each holds -- shown or
// hidden, the shop type it behaves like, its order, its suggested attributes and its own chart -- and the writes, each
// changing the fixture as the server's rows would, refusing a delete as the server does (PRD-03).

/** A category: its id, its parent, and its name in both languages. */
export type CategoryFixture = [string, string | null, string, string];

/** What a category holds beyond its place and name, where it differs from a new one's. */
export interface CategoryStateFixture {
  visible?: boolean;
  behavesLike?: string | null;
  sortOrder?: number;
  suggested?: string[];
  chartImageId?: string;
  /** Its products where a drawing shows more than the fixture's products file under it. */
  productCount?: number;
}

// In the shop's order (the prototype's `CATS`).
export const CATEGORIES: CategoryFixture[] = [
  ['c-tshirts', null, 'টি-শার্ট', 'T-shirts'],
  ['c-men', 'c-tshirts', 'ছেলেদের', 'Men'],
  ['c-women', 'c-tshirts', 'মেয়েদের', 'Women'],
  ['c-jackets', null, 'জ্যাকেট', 'Jackets'],
  ['c-sarees', null, 'শাড়ি', 'Sarees'],
  ['c-kids', null, 'কিডস', 'Kids'],
  ['c-accessories', null, 'অ্যাক্সেসরিজ', 'Accessories'],
];

const treeOf = (fixture: ProductsFixture): CategoryFixture[] =>
  (fixture.categories ??= CATEGORIES.map((each) => [...each] as CategoryFixture));

const stateOf = (fixture: ProductsFixture, id: string): CategoryStateFixture =>
  ((fixture.categoryState ??= {})[id] ??= {});

function depthOf(tree: readonly CategoryFixture[], id: string): number {
  let depth = 1;
  let parent = tree.find((each) => each[0] === id)?.[1] ?? null;
  while (parent !== null) {
    depth += 1;
    const above: string = parent;
    parent = tree.find((each) => each[0] === above)?.[1] ?? null;
  }
  return depth;
}

/** The products not archived filed under a category. */
function filedIn(fixture: ProductsFixture, id: string): number {
  return fixture.products.filter(
    (product) =>
      !product.archived &&
      (
        product.categoryIds ?? (product.primaryCategoryId ? [product.primaryCategoryId] : [])
      ).includes(id),
  ).length;
}

function categoryView(
  fixture: ProductsFixture,
  [id, parentId, bn, en]: CategoryFixture,
  index: number,
  language: Language,
): unknown {
  const state = fixture.categoryState?.[id] ?? {};
  return {
    id,
    parentId,
    name: language === 'bn' ? bn : en,
    slug: id.slice(2),
    depth: depthOf(treeOf(fixture), id),
    sortOrder: state.sortOrder ?? index,
    visible: state.visible ?? true,
    productCount: state.productCount ?? filedIn(fixture, id),
    suggestedAttributeIds: state.suggested ?? [],
    behavesLike: state.behavesLike ?? null,
    image: null,
    sizeChart: fixture.charts?.[id] ?? null,
    sizeChartImage: state.chartImageId
      ? {
          id: state.chartImageId,
          urls: { main: `/chart/${state.chartImageId}`, thumbnail: `/chart/${state.chartImageId}` },
        }
      : null,
  };
}

/** GET /categories. */
export function categoryList(fixture: ProductsFixture, language: Language): unknown {
  return treeOf(fixture).map((entry, index) => categoryView(fixture, entry, index, language));
}

let made = 0;

const conflict = (message: string, details: Record<string, unknown>): ProductRefusal => ({
  status: 409,
  code: 'conflict',
  message,
  details,
});

/** The Categories page's writes (and the editor picker's new category); undefined for any other request. */
export function categoryWrite(
  method: string,
  path: string,
  url: URL,
  body: Record<string, unknown> | null,
  fixture: ProductsFixture,
  language: Language,
): { data: unknown } | { refused: ProductRefusal } | undefined {
  const tree = treeOf(fixture);
  const answer = (id: string) => {
    const index = tree.findIndex((each) => each[0] === id);
    const entry = tree[index];
    return entry ? { data: categoryView(fixture, entry, index, language) } : undefined;
  };
  if (method === 'POST' && path === '/categories') {
    const id = `c-new-${String((made += 1))}`;
    const name = typeof body?.name === 'string' ? body.name : '';
    tree.push([id, typeof body?.parentId === 'string' ? body.parentId : null, name, name]);
    Object.assign(stateOf(fixture, id), {
      visible: body?.visible !== false,
      behavesLike: (body?.behavesLike as string | null | undefined) ?? null,
      sortOrder: typeof body?.sortOrder === 'number' ? body.sortOrder : 0,
    });
    return answer(id);
  }
  const chart = /^\/categories\/([^/]+)\/size-chart$/.exec(path);
  if (chart && (method === 'PUT' || method === 'DELETE')) {
    const id = chart[1] ?? '';
    const state = stateOf(fixture, id);
    const charts = Object.fromEntries(
      Object.entries(fixture.charts ?? {}).filter(([key]) => key !== id),
    );
    delete state.chartImageId;
    if (method === 'PUT' && Array.isArray(body?.rows)) charts[id] = body.rows as string[][];
    if (method === 'PUT' && typeof body?.imageId === 'string') state.chartImageId = body.imageId;
    fixture.charts = charts;
    return { data: method === 'PUT' ? { rows: charts[id] ?? null } : { ok: true } };
  }
  const suggested = /^\/categories\/([^/]+)\/attributes$/.exec(path);
  if (suggested && method === 'PUT') {
    stateOf(fixture, suggested[1] ?? '').suggested =
      (body?.attributeIds as string[] | undefined) ?? [];
    return answer(suggested[1] ?? '');
  }
  const one = /^\/categories\/([^/]+)$/.exec(path);
  const entry = tree.find((each) => each[0] === one?.[1]);
  if (!one || !entry) return undefined;
  const id = entry[0];
  if (method === 'PATCH') {
    if (typeof body?.name === 'string') {
      entry[2] = body.name;
      entry[3] = body.name;
    }
    if (body && 'parentId' in body) entry[1] = (body.parentId as string | null) ?? null;
    const state = stateOf(fixture, id);
    if (typeof body?.visible === 'boolean') state.visible = body.visible;
    if (body && 'behavesLike' in body) state.behavesLike = body.behavesLike as string | null;
    if (typeof body?.sortOrder === 'number') state.sortOrder = body.sortOrder;
    return answer(id);
  }
  if (method === 'DELETE') {
    const children = tree.filter((each) => each[1] === id).length;
    if (children > 0) return { refused: conflict('It has sub-categories.', { count: children }) };
    const holding = fixture.categoryState?.[id]?.productCount ?? filedIn(fixture, id);
    if (holding > 0 && url.searchParams.get('products') !== 'uncategorize') {
      return { refused: conflict('It holds products.', { count: holding }) };
    }
    for (const product of fixture.products) {
      product.categoryIds = product.categoryIds?.filter((each) => each !== id);
      if (product.primaryCategoryId === id) product.primaryCategoryId = null;
    }
    fixture.categories = tree.filter((each) => each[0] !== id);
    fixture.categoryState = Object.fromEntries(
      Object.entries(fixture.categoryState ?? {}).filter(([key]) => key !== id),
    );
    return { data: { ok: true } };
  }
  return undefined;
}
