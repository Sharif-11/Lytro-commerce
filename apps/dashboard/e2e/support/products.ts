import type { Language } from './mock-api';

// The Products page against a mocked API (Slice 11.7a): the prototype's six products of Megh Fashion and its category
// tree, with Part 13's two archived products. GET /products filters and counts them as the server does (PRD-12, INV-08,
// PRD-13): search by name, a category or Uncategorized, Active and Inactive, Low and Out among the active ones, the
// archived alone; 20 a page; the counts over what the search and category pick.

export interface ProductFixture {
  id: string;
  name: [string, string];
  basePrice: string;
  maxPrice?: string;
  active: boolean;
  stockState: 'in' | 'low' | 'out';
  primaryCategoryId: string | null;
  variantCount: number;
  archived?: boolean;
}

/** The shop's products where they differ from the prototype's, and its product limit (null for none). */
export interface ProductsFixture {
  products: ProductFixture[];
  limit: number | null;
}

// [id, parent, Bangla, English], in the shop's order (the prototype's `CATS`).
const CATEGORIES: [string, string | null, string, string][] = [
  ['c-tshirts', null, 'টি-শার্ট', 'T-shirts'],
  ['c-men', 'c-tshirts', 'ছেলেদের', 'Men'],
  ['c-women', 'c-tshirts', 'মেয়েদের', 'Women'],
  ['c-jackets', null, 'জ্যাকেট', 'Jackets'],
  ['c-sarees', null, 'শাড়ি', 'Sarees'],
  ['c-kids', null, 'কিডস', 'Kids'],
  ['c-accessories', null, 'অ্যাক্সেসরিজ', 'Accessories'],
];

export function categoryList(language: Language): unknown {
  return CATEGORIES.map(([id, parentId, bn, en], index) => ({
    id,
    parentId,
    name: language === 'bn' ? bn : en,
    slug: id.slice(2),
    depth: parentId === null ? 1 : 2,
    sortOrder: index,
    visible: true,
    productCount: 0,
    suggestedAttributeIds: [],
    behavesLike: null,
    image: null,
    sizeChart: null,
    sizeChartImage: null,
  }));
}

/** The prototype's six (`PRODUCTS`) and Part 13's two archived (`ARCHIVED13`). */
export function drawnProducts(): ProductsFixture {
  return {
    limit: 100,
    products: [
      {
        id: 'p-1',
        name: ['কটন টি-শার্ট', 'Cotton T-shirt'],
        basePrice: '450.00',
        maxPrice: '490.00',
        active: true,
        stockState: 'in',
        primaryCategoryId: 'c-tshirts',
        variantCount: 10,
      },
      {
        id: 'p-2',
        name: ['ডেনিম জ্যাকেট', 'Denim jacket'],
        basePrice: '1890.00',
        active: true,
        stockState: 'low',
        primaryCategoryId: 'c-jackets',
        variantCount: 4,
      },
      {
        id: 'p-3',
        name: ['সিল্ক শাড়ি', 'Silk saree'],
        basePrice: '3200.00',
        active: true,
        stockState: 'in',
        primaryCategoryId: 'c-sarees',
        variantCount: 1,
      },
      {
        id: 'p-4',
        name: ['কিডস ফ্রক', 'Kids frock'],
        basePrice: '650.00',
        maxPrice: '720.00',
        active: true,
        stockState: 'out',
        primaryCategoryId: 'c-kids',
        variantCount: 6,
      },
      {
        id: 'p-5',
        name: ['হুডি', 'Hoodie'],
        basePrice: '1250.00',
        active: false,
        stockState: 'in',
        primaryCategoryId: 'c-jackets',
        variantCount: 5,
      },
      {
        id: 'p-6',
        name: ['স্কার্ফ', 'Scarf'],
        basePrice: '320.00',
        active: true,
        stockState: 'in',
        primaryCategoryId: 'c-accessories',
        variantCount: 3,
      },
      {
        id: 'p-7',
        name: ['লিনেন পাঞ্জাবি', 'Linen panjabi'],
        basePrice: '1450.00',
        active: true,
        stockState: 'in',
        primaryCategoryId: null,
        variantCount: 4,
        archived: true,
      },
      {
        id: 'p-8',
        name: ['উলের মাফলার', 'Wool muffler'],
        basePrice: '380.00',
        active: true,
        stockState: 'out',
        primaryCategoryId: 'c-accessories',
        variantCount: 1,
        archived: true,
      },
    ],
  };
}

/** A shop with `count` live products, for Show more: the drawn six, then plain ones. */
export function manyProducts(count: number): ProductsFixture {
  const drawn = drawnProducts().products.filter((each) => !each.archived);
  const more = Array.from({ length: count - drawn.length }, (_, index) => ({
    id: `p-x${String(index + 1)}`,
    name: [`পণ্য ${String(index + 1)}`, `Item ${String(index + 1)}`] as [string, string],
    basePrice: '100.00',
    active: true,
    stockState: 'in' as const,
    primaryCategoryId: null,
    variantCount: 1,
  }));
  return { limit: null, products: [...drawn, ...more] };
}

function summary(product: ProductFixture, language: Language): unknown {
  return {
    id: product.id,
    name: language === 'bn' ? product.name[0] : product.name[1],
    slug: product.name[1].toLowerCase().replaceAll(' ', '-'),
    basePrice: product.basePrice,
    minPrice: product.basePrice,
    maxPrice: product.maxPrice ?? product.basePrice,
    active: product.active,
    stockState: product.stockState,
    primaryCategoryId: product.primaryCategoryId,
    variantCount: product.variantCount,
    image: null,
    createdAt: new Date().toISOString(),
  };
}

/** GET /products, as the server answers it. */
export function productList(fixture: ProductsFixture, url: URL, language: Language): unknown {
  const query = url.searchParams;
  const search = (query.get('search') ?? '').toLowerCase();
  const categoryId = query.get('categoryId');
  const picked = fixture.products.filter(
    (product) =>
      (search === '' || product.name.some((name) => name.toLowerCase().includes(search))) &&
      (categoryId === null ||
        (categoryId === 'uncategorized'
          ? product.primaryCategoryId === null
          : product.primaryCategoryId === categoryId)),
  );
  const live = picked.filter((product) => !product.archived);
  const counts = {
    total: live.length,
    active: live.filter((product) => product.active).length,
    low: live.filter((product) => product.active && product.stockState === 'low').length,
    out: live.filter((product) => product.active && product.stockState === 'out').length,
    archived: picked.length - live.length,
  };
  const active = query.get('active');
  const stock = query.get('stock');
  const rows = (query.get('archived') === 'true' ? picked.filter((each) => each.archived) : live)
    .filter((product) => active === null || String(product.active) === active)
    .filter((product) => stock === null || product.stockState === stock);
  const limit = Number(query.get('limit') ?? 20);
  const page = Number(query.get('page') ?? 1);
  return {
    products: rows.slice((page - 1) * limit, page * limit).map((each) => summary(each, language)),
    page,
    limit,
    total: rows.length,
    pages: Math.ceil(rows.length / limit),
    counts,
    productLimit: fixture.limit,
  };
}
