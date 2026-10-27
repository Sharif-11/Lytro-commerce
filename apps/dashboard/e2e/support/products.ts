import type { Language } from './mock-api';
import {
  createdMatrix,
  drawnTshirt,
  variantPart,
  variantWrite,
  type AttributeFixture,
  type DescriptionFixture,
  type MatrixFixture,
} from './variants';

// Products and the product editor against a mocked API (Slice 11.7a): the prototype's six products of Megh Fashion
// and its category tree, with Part 13's two archived products. GET /products filters and counts them as the server
// does (PRD-12, INV-08, PRD-13); GET /products/:id answers the editor; the writes change the fixture, so the reads
// after them show what was done, and refuse as the server does where a test asks it to.

export interface ProductFixture {
  id: string;
  name: [string, string];
  basePrice: string;
  maxPrice?: string;
  active: boolean;
  stockState: 'in' | 'low' | 'out';
  primaryCategoryId: string | null;
  categoryIds?: string[];
  variantCount: number;
  archived?: boolean;
  description?: string | null;
  slug?: string;
  /** The values of each variant-defining attribute; their product is the variants. */
  options?: string[][];
  imageIds?: string[];
  videoId?: string | null;
  /** Slice 11.7b: its variants as saved; made from `options` when left out. */
  matrix?: MatrixFixture;
  descriptions?: DescriptionFixture[];
  stockTracking?: 'tracked' | 'not_tracked';
  stockUnit?: string;
  serialTracked?: boolean;
  sharedStock?: boolean;
}

/** A category: its id, its parent, and its name in both languages. */
export type CategoryFixture = [string, string | null, string, string];

/** An uploaded item: its kind and its bytes. */
export interface MediaFixture {
  kind: 'image' | 'video';
  bytes: number;
}

/** The shop's products where they differ from the prototype's, its product limit (null for none), and its tree. */
export interface ProductsFixture {
  products: ProductFixture[];
  limit: number | null;
  categories?: CategoryFixture[];
  /** The items uploaded beyond the drawn photos, by id. */
  media?: Record<string, MediaFixture>;
  /** Storage: full refuses every upload (STO-03). */
  storage?: { full?: boolean; usedBytes?: number; limitBytes?: number | null };
  /** What the server refuses, for the tests that need a refusal: the photos (storage full), a name, a link, an SKU. */
  refuse?: { images?: boolean; name?: string; slug?: string; sku?: string };
  /** Slice 11.7b: the attributes the shop sees, its option sets, and a new product's defaults where they differ. */
  library?: AttributeFixture[];
  optionSets?: unknown[];
  defaults?: Record<string, unknown>;
}

// In the shop's order (the prototype's `CATS`).
const CATEGORIES: CategoryFixture[] = [
  ['c-tshirts', null, 'টি-শার্ট', 'T-shirts'],
  ['c-men', 'c-tshirts', 'ছেলেদের', 'Men'],
  ['c-women', 'c-tshirts', 'মেয়েদের', 'Women'],
  ['c-jackets', null, 'জ্যাকেট', 'Jackets'],
  ['c-sarees', null, 'শাড়ি', 'Sarees'],
  ['c-kids', null, 'কিডস', 'Kids'],
  ['c-accessories', null, 'অ্যাক্সেসরিজ', 'Accessories'],
];

export function categoryList(fixture: ProductsFixture, language: Language): unknown {
  return (fixture.categories ?? CATEGORIES).map(([id, parentId, bn, en], index) => ({
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
        description: '100% cotton, pre-shrunk. Keeps its size after washing.',
        options: [
          ['S', 'M', 'L', 'XL', 'XXL'],
          ['Black', 'Blue'],
        ],
        matrix: drawnTshirt(),
        descriptions: [{ attributeId: 'a-3', role: 'informational', textValue: '100% cotton' }],
        imageIds: ['m-1', 'm-2', 'm-3'],
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

const nameIn = (product: ProductFixture, language: Language): string =>
  language === 'bn' ? product.name[0] : product.name[1];

const slugOf = (product: ProductFixture): string =>
  product.slug ?? product.name[1].toLowerCase().replaceAll(' ', '-');

/** A picture the browser can show, standing in for a stored photo. */
function picture(id: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#b9ece6"/><text x="150" y="160" font-size="40" text-anchor="middle" fill="#0e6b66">${id}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function summary(product: ProductFixture, language: Language): unknown {
  const first = product.imageIds?.[0];
  return {
    id: product.id,
    name: nameIn(product, language),
    slug: slugOf(product),
    basePrice: product.basePrice,
    minPrice: product.basePrice,
    maxPrice: product.maxPrice ?? product.basePrice,
    active: product.active,
    stockState: product.stockState,
    primaryCategoryId: product.primaryCategoryId,
    variantCount: product.variantCount,
    image: first ? { id: first, urls: { main: picture(first), thumbnail: picture(first) } } : null,
    createdAt: new Date().toISOString(),
  };
}

/** GET /products/:id: what the editor reads (the server's ProductDetail, as far as Slice 11.7b reads it). */
export function productDetail(
  product: ProductFixture,
  language: Language,
  fixture: ProductsFixture,
): unknown {
  const categoryIds =
    product.categoryIds ?? (product.primaryCategoryId ? [product.primaryCategoryId] : []);
  return {
    ...(summary(product, language) as object),
    oldSlugs: [],
    description: product.description ?? null,
    archived: product.archived ?? false,
    categoryIds,
    ...variantPart(product, fixture),
    images: (product.imageIds ?? []).map((id) => ({
      id,
      urls: { main: picture(id), thumbnail: picture(id) },
      bytes: 820_000,
    })),
    video: product.videoId
      ? {
          id: product.videoId,
          urls: { video: '', poster: picture(product.videoId) },
          bytes: 14_000_000,
          durationMs: 42_000,
        }
      : null,
    updatedAt: new Date().toISOString(),
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

/** A refusal as the server words it, with its status. */
export interface ProductRefusal {
  status: number;
  code: string;
  message: string;
  details: Record<string, unknown>;
}

const LIMIT_REACHED = (fixture: ProductsFixture): ProductRefusal => ({
  status: 402,
  code: 'plan_limit_reached',
  message: `The plan allows ${String(fixture.limit)} products.`,
  details: { products: fixture.limit },
});

const fieldRefusal = (field: string, message: string): ProductRefusal => ({
  status: 400,
  code: 'validation_failed',
  message,
  details: { fields: [{ field, problem: 'not_allowed', message }] },
});

const full = (fixture: ProductsFixture): boolean =>
  fixture.limit !== null &&
  fixture.products.filter((each) => !each.archived).length >= fixture.limit;

let made = 0;

const MB = 1024 * 1024;
/** Where the browser sends an upload's file; the mock takes it. */
export const MEDIA_UPLOAD_PREFIX = '/__upload/';

function mediaView(id: string, item: MediaFixture, status: string): unknown {
  const ready = status === 'ready';
  return {
    id,
    kind: item.kind,
    status,
    purpose: item.kind === 'video' ? 'product_video' : 'product_image',
    width: ready ? 1600 : null,
    height: ready ? 1600 : null,
    durationMs: ready && item.kind === 'video' ? 42_000 : null,
    bytes: ready ? item.bytes : 0,
    urls: ready ? { main: picture(id), thumbnail: picture(id) } : null,
    failure: null,
    createdAt: new Date().toISOString(),
  };
}

/** GET /media/usage, as the server answers it (STO-01, STO-04, STO-05). */
export function storageAnswer(fixture: ProductsFixture): unknown {
  const limit = fixture.storage?.limitBytes;
  return {
    usedBytes: fixture.storage?.usedBytes ?? 180 * MB,
    limitBytes: limit === undefined ? 2048 * MB : limit,
    imageMaxMb: 5,
    videoMaxMb: 150,
  };
}

/** GET /media/:id for a product's item: the item and where it still shows (MED-09); null for one the mock never made. */
export function mediaDetail(fixture: ProductsFixture, id: string): unknown {
  // The drawn photos (m-1, m-2, ...) are the shop's whether or not a product still shows them.
  const drawn = /^m-\d+$/.test(id);
  const item = fixture.media?.[id] ?? (drawn ? { kind: 'image' as const, bytes: 820_000 } : null);
  if (!item) return null;
  return {
    ...(mediaView(id, item, 'ready') as object),
    uses: {
      products: fixture.products.filter((each) => each.imageIds?.includes(id)).length,
      videos: fixture.products.filter((each) => each.videoId === id).length,
      categories: 0,
      swatches: 0,
      sizeCharts: 0,
      logo: false,
      pastOrders: 0,
    },
  };
}

/** The editor's writes (§7.4): the fixture changes as the server's rows would. */
export function productWrite(
  method: string,
  path: string,
  body: Record<string, unknown> | null,
  fixture: ProductsFixture,
  language: Language,
): { data: unknown } | { refused: ProductRefusal } | undefined {
  const named = (value: unknown): [string, string] => [String(value), String(value)];
  const variants = variantWrite(method, path, body, fixture, (product) =>
    productDetail(product, language, fixture),
  );
  if (variants) return variants;
  if (method === 'POST' && path === '/media/uploads') {
    // The logo's upload is Settings' own (support/settings.ts).
    const purpose = body?.purpose;
    if (purpose !== 'product_image' && purpose !== 'product_video' && purpose !== 'swatch_image') {
      return undefined;
    }
    if (fixture.storage?.full) {
      return {
        refused: {
          status: 402,
          code: 'plan_limit_reached',
          message: 'Storage is full.',
          details: { metric: 'storage' },
        },
      };
    }
    const kind = purpose === 'product_video' ? 'video' : 'image';
    const bytes = Number(body?.bytes ?? 0);
    if (kind === 'image' && bytes > 5 * MB) {
      return { refused: fieldRefusal('bytes', 'An image may be 5 MB at most.') };
    }
    const id = `m-up-${String((made += 1))}`;
    const item: MediaFixture = { kind, bytes };
    (fixture.media ??= {})[id] = item;
    return {
      data: {
        media: mediaView(id, item, 'uploading'),
        upload: {
          url: `${MEDIA_UPLOAD_PREFIX}${id}`,
          method: 'PUT',
          headers: {
            'content-type': typeof body?.contentType === 'string' ? body.contentType : '',
          },
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
      },
    };
  }
  const finished = /^\/media\/([^/]+)\/finish$/.exec(path);
  const uploaded = fixture.media?.[finished?.[1] ?? ''];
  if (method === 'POST' && finished && uploaded) {
    return { data: mediaView(finished[1] ?? '', uploaded, 'ready') };
  }
  if (method === 'POST' && path === '/categories') {
    const id = `c-new-${String((made += 1))}`;
    const name = typeof body?.name === 'string' ? body.name : '';
    fixture.categories = [
      ...(fixture.categories ?? CATEGORIES),
      [id, typeof body?.parentId === 'string' ? body.parentId : null, name, name],
    ];
    return { data: { id, parentId: body?.parentId ?? null, name, sortOrder: 99 } };
  }
  if (method === 'POST' && path === '/products') {
    if (full(fixture)) return { refused: LIMIT_REACHED(fixture) };
    if (fixture.refuse?.name && body?.name === fixture.refuse.name) {
      return { refused: fieldRefusal('name', 'A product already has that name.') };
    }
    const categoryIds = (body?.categoryIds as string[] | undefined) ?? [];
    const product: ProductFixture = {
      id: `p-new-${String((made += 1))}`,
      name: named(body?.name),
      basePrice: Number(body?.basePrice).toFixed(2),
      active: body?.active !== false,
      stockState: 'in',
      primaryCategoryId:
        (body?.primaryCategoryId as string | null | undefined) ?? categoryIds[0] ?? null,
      categoryIds,
      variantCount: 1,
      description: (body?.description as string | null | undefined) ?? null,
      imageIds: (body?.imageIds as string[] | undefined) ?? [],
      videoId: (body?.videoId as string | undefined) ?? null,
    };
    if (body) createdMatrix(product, body, fixture);
    fixture.products.unshift(product);
    return { data: productDetail(product, language, fixture) };
  }
  const match = /^\/products\/([^/]+)(\/[a-z-]+)?$/.exec(path);
  const product = fixture.products.find((each) => each.id === match?.[1]);
  if (!match || !product) return undefined;
  const part = match[2] ?? '';
  const answer = (): { data: unknown } => ({ data: productDetail(product, language, fixture) });
  if (method === 'PATCH' && part === '') {
    if (fixture.refuse?.name && body?.name === fixture.refuse.name) {
      return { refused: fieldRefusal('name', 'A product already has that name.') };
    }
    if (typeof body?.name === 'string') product.name = named(body.name);
    if (body?.basePrice !== undefined) product.basePrice = Number(body.basePrice).toFixed(2);
    if (body && 'description' in body) product.description = body.description as string | null;
    if (Array.isArray(body?.categoryIds)) product.categoryIds = body.categoryIds as string[];
    if (body && 'primaryCategoryId' in body) {
      product.primaryCategoryId = body.primaryCategoryId as string | null;
    }
    if (typeof body?.active === 'boolean') product.active = body.active;
    return answer();
  }
  if (method === 'PUT' && part === '/images') {
    if (fixture.refuse?.images) {
      return {
        refused: {
          status: 402,
          code: 'plan_limit_reached',
          message: 'Storage is full: 2 of 2 GB.',
          details: {},
        },
      };
    }
    product.imageIds = body?.mediaIds as string[];
    return answer();
  }
  if (method === 'PUT' && part === '/video') {
    product.videoId = body?.mediaId as string | null;
    return answer();
  }
  if (method === 'PUT' && part === '/slug') {
    if (fixture.refuse?.slug && body?.slug === fixture.refuse.slug) {
      return { refused: fieldRefusal('slug', 'Another product has that link.') };
    }
    product.slug = String(body?.slug);
    return answer();
  }
  if (method === 'POST' && part === '/duplicate') {
    if (full(fixture)) return { refused: LIMIT_REACHED(fixture) };
    const copy: ProductFixture = {
      ...product,
      id: `p-new-${String((made += 1))}`,
      name: [`${product.name[0]} (copy)`, `${product.name[1]} (copy)`],
      slug: `${slugOf(product)}-2`,
      active: false,
    };
    fixture.products.unshift(copy);
    return { data: productDetail(copy, language, fixture) };
  }
  if (method === 'POST' && part === '/restore') {
    if (product.archived && full(fixture)) return { refused: LIMIT_REACHED(fixture) };
    product.archived = false;
    return answer();
  }
  return undefined;
}

/** DELETE /products/:id: archived, or gone for good with `?hard=true` (PRD-13). */
export function productRemove(fixture: ProductsFixture, id: string, hard: boolean): void {
  if (hard) fixture.products = fixture.products.filter((each) => each.id !== id);
  else {
    const product = fixture.products.find((each) => each.id === id);
    if (product) product.archived = true;
  }
}
