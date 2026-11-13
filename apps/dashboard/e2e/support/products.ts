import { CATEGORIES, type CategoryFixture, type CategoryStateFixture } from './categories';
import { comboQuote, partViews, retiredField } from './combos';
import type { PickerProduct } from './new-order';
import { drawnTax, type TaxFixture } from './tax';
import type { Language } from './mock-api';
import type { BatchFixture, MovementFixture } from './stock';
import type { PurchasingFixture } from './purchases';
import type { CheckFixture } from './stock-checks';
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
  /** ATR-19 (PD-2): the design each photo shows, by the design's id; a photo left out is plain. */
  photoDesigns?: Record<string, string | null>;
  /** ATR-19 (PD-14): its live designs, in number order. */
  designs?: { id: string; name: string; number: number }[];
  /** PD-14: the number its next new design takes; one past its designs' when left out. */
  nextDesignNumber?: number;
  /** ATR-15 (PD-11): whether an order names it. */
  hasOrders?: boolean;
  videoId?: string | null;
  /** Slice 11.7b: its variants as saved; made from `options` when left out. */
  matrix?: MatrixFixture;
  descriptions?: DescriptionFixture[];
  stockTracking?: 'tracked' | 'not_tracked';
  stockUnit?: string;
  serialTracked?: boolean;
  sharedStock?: boolean;
  /** Slice 11.7c: its other stock, delivery and payment settings as saved, where they differ from `SETTINGS`. */
  settings?: Record<string, unknown>;
  /** DLV-07: the zones it may be delivered to; none for wherever the shop delivers. */
  zoneIds?: string[];
  /** PRD-17: its own chart, a table or a picture. */
  chart?: { rows: string[][] } | { imageId: string } | null;
  /** Slice 11.7c: its batches holding stock, its shared stock, and each variant's movements, newest first. */
  batches?: BatchFixture[];
  sharedOnHand?: number;
  history?: Record<string, MovementFixture[]>;
  /** CMB-01 (Slice 4.8c): an ordinary product unless it says so, with its parts and their figures. */
  kind?: 'standard' | 'combo';
  parts?: { quantity: string; variantIds: string[] }[];
  combo?: {
    canMake: number | null;
    limitedBy: { position: number; productName: string; available: string } | null;
    issues: { position: number; productName: string; reason: string }[];
  };
  /** INV-15 (Slice 4.8c): a stock line short for orders, as Stock lists it. */
  short?: {
    variantId: string;
    name: [string, string];
    held: number;
    onHand: number;
    short: number;
  };
  /** TAX-01, MNU-01 (Slice 4.8c). */
  taxClassId?: string | null;
  modifierGroups?: {
    id?: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    options: { id?: string; name: string; priceChange: string | number; isDefault?: boolean }[];
  }[];
}

/** An uploaded item: its kind and its bytes, and whether the brand identity shows it (KNOWN-GAPS §97). */
export interface MediaFixture {
  kind: 'image' | 'video';
  bytes: number;
  brand?: boolean;
}

/** The shop's products where they differ from the prototype's, its product limit (null for none), and its tree. */
export interface ProductsFixture {
  /** MED-09: how many past orders show each photo. */
  pastOrders?: Record<string, number>;
  products: ProductFixture[];
  /** Slice 4.8c: what the combo editor's Add an item finds, and the combos a product is inside, by its id (PRD-13). */
  picker?: PickerProduct[];
  inCombos?: Record<string, { id: string; name: string }[]>;
  /** Slice 4.8c: the shop's tax classes; Part 31's three unless a test gives its own. */
  tax?: TaxFixture;
  limit: number | null;
  categories?: CategoryFixture[];
  /** Slice 11.8: what each category holds beyond its place and name, by id. */
  categoryState?: Record<string, CategoryStateFixture>;
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
  /** Slice 11.7c: the defaults a category's own shop type brings (PST-06), by category id. */
  categoryDefaults?: Record<string, Record<string, unknown>>;
  /** Slice 11.7c: the categories' own charts (PRD-17), by category id. */
  charts?: Record<string, string[][]>;
  /** Slice 11.7c: serials the shop's units already have, as stored (INV-23, POST /serials/check). */
  takenSerials?: string[];
  /** Slice 11.9: the Stock page's figures, where they differ from the sketch's. */
  figures?: FiguresFixture;
  /** Slice 11.9: the shop's stock checks; the sketch's three when left out. */
  checks?: CheckFixture[];
  /** Slice 11.10: the shop's suppliers and purchases; the sketch's when left out. */
  purchasing?: PurchasingFixture;
}

/** INV-18: this month's figures as the Stock page's tiles read them; losses by reason, how many times each. */
export interface FiguresFixture {
  stockValue: string;
  costOfGoodsSold: string;
  losses: string;
  byReason: { reason: string; movements: number }[];
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
        // Part 15's `product`: a weight, the charge adjusting by it (PRD-16).
        settings: { weightKg: '0.250', deliveryMode: 'adjustable' },
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

export const nameIn = (product: ProductFixture, language: Language): string =>
  language === 'bn' ? product.name[0] : product.name[1];

const slugOf = (product: ProductFixture): string =>
  product.slug ?? product.name[1].toLowerCase().replaceAll(' ', '-');

/** Where stored photos are read from in production; null draws them in the page instead. */
let mediaOrigin: string | null = null;

/**
 * Serves the stored photos from a media address, as production does (MEDIA_PUBLIC_BASE_URL), for the Content Security
 * Policy check (csp.spec.ts); null puts back the pictures drawn in the page, which every other test shows.
 */
export function servePicturesFrom(origin: string | null): void {
  mediaOrigin = origin;
}

/** A picture the browser can show, standing in for a stored photo. */
function picture(id: string): string {
  if (mediaOrigin !== null) return `${mediaOrigin}/megh/${encodeURIComponent(id)}.png`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#b9ece6"/><text x="150" y="160" font-size="40" text-anchor="middle" fill="#0e6b66">${id}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function summary(product: ProductFixture, language: Language): unknown {
  const first = product.imageIds?.[0];
  return {
    id: product.id,
    kind: product.kind ?? 'standard',
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

/** A product's settings as a new one has them, unless it saved its own. */
const SETTINGS: Record<string, unknown> = {
  lowStockThreshold: '5.000',
  serialFormat: 'any',
  condition: 'new',
  weightKg: null,
  deliveryCharge: null,
  deliveryMode: 'default',
  paymentPolicy: null,
  advanceAmount: null,
};
/** What a PATCH or POST /products may set of them, beside the product's own fields. */
const SETTING_KEYS = [...Object.keys(SETTINGS), 'batchTracked'];

/** PRD-17: its own chart, else the nearest category's, the primary one or one above it. */
function chartView(product: ProductFixture, fixture: ProductsFixture): unknown {
  const own = product.chart;
  if (own) {
    return {
      source: 'product',
      categoryId: null,
      rows: 'rows' in own ? own.rows : null,
      image:
        'imageId' in own
          ? {
              id: own.imageId,
              urls: { main: picture(own.imageId), thumbnail: picture(own.imageId) },
            }
          : null,
    };
  }
  const tree = fixture.categories ?? CATEGORIES;
  let id = product.primaryCategoryId;
  while (id) {
    const rows = fixture.charts?.[id];
    if (rows) return { source: 'category', categoryId: id, rows, image: null };
    id = tree.find((each) => each[0] === id)?.[1] ?? null;
  }
  return null;
}

/** A stored amount as the server answers it: a typed number is its decimal string. */
const stored = (value: unknown): unknown => (typeof value === 'number' ? String(value) : value);

/** The settings a PATCH or a POST /products sent, saved as the server's row would hold them. */
function saveSettings(product: ProductFixture, body: Record<string, unknown>): void {
  for (const key of SETTING_KEYS) {
    if (key in body) (product.settings ??= {})[key] = stored(body[key]);
  }
  if (body.stockTracking === 'tracked' || body.stockTracking === 'not_tracked') {
    product.stockTracking = body.stockTracking;
  }
  if (typeof body.stockUnit === 'string') product.stockUnit = body.stockUnit;
  if (typeof body.serialTracked === 'boolean') product.serialTracked = body.serialTracked;
}

/** GET /products/:id: what the editor reads (the server's ProductDetail, as far as Slice 11.7c reads it). */
export function productDetail(
  product: ProductFixture,
  language: Language,
  fixture: ProductsFixture,
): unknown {
  const categoryIds =
    product.categoryIds ?? (product.primaryCategoryId ? [product.primaryCategoryId] : []);
  return {
    ...(summary(product, language) as object),
    parts: partViews(product.parts ?? [], fixture.picker ?? [], language),
    taxClass:
      (fixture.tax ?? drawnTax()).classes.find((each) => each.id === product.taxClassId) ?? null,
    modifierGroups: (product.modifierGroups ?? []).map((group, at) => ({
      id: group.id ?? `g-${String(at)}`,
      name: group.name,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      options: group.options.map((option, place) => ({
        id: option.id ?? `o-${String(at)}-${String(place)}`,
        name: option.name,
        priceChange: Number(option.priceChange).toFixed(2),
        isDefault: option.isDefault ?? false,
      })),
    })),
    oldSlugs: [],
    description: product.description ?? null,
    archived: product.archived ?? false,
    categoryIds,
    ...variantPart(product, fixture),
    ...settingsPart(product, fixture),
    images: (product.imageIds ?? []).map((id) => ({
      id,
      urls: { main: picture(id), thumbnail: picture(id) },
      bytes: 820_000,
      width: 600,
      height: 900,
      designId: product.photoDesigns?.[id] ?? null,
    })),
    designs: (product.designs ?? []).map((design) => ({
      ...design,
      photoIds: (product.imageIds ?? []).filter((id) => product.photoDesigns?.[id] === design.id),
    })),
    nextDesignNumber: nextDesignOf(product),
    hasOrders: product.hasOrders ?? false,
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

/** PD-14: the number a product's next new design takes. */
const nextDesignOf = (product: ProductFixture): number =>
  product.nextDesignNumber ??
  (product.designs ?? []).reduce((most, design) => Math.max(most, design.number), 0) + 1;

/** A photos save's designs and photos, as PUT /products/:id/images and a new product send them (ATR-19). */
interface SentPhotos {
  photos: { mediaId: string; design: string | null }[];
  designs?: { key: string; id?: string; name?: string }[];
}

/**
 * PD-16, as the server saves them: each design by its key, a new one taking the next number never used; the photos with
 * their designs; a design no photo shows retired, its variants with it. Returns each design's id by its key.
 */
function savePhotos(product: ProductFixture, sent: SentPhotos): Map<string, string> {
  const current = product.designs ?? [];
  let next = nextDesignOf(product);
  const ids = new Map<string, string>();
  const kept: { id: string; name: string; number: number }[] = [];
  for (const design of sent.designs ?? []) {
    const was = design.id ? current.find((each) => each.id === design.id) : undefined;
    if (was) {
      kept.push({ ...was, name: design.name ?? was.name });
      ids.set(design.key, was.id);
    } else {
      const id = `d-new-${String((made += 1))}`;
      kept.push({ id, name: design.name ?? `D${String(next)}`, number: next });
      ids.set(design.key, id);
      next += 1;
    }
  }
  product.imageIds = sent.photos.map((photo) => photo.mediaId);
  product.photoDesigns = Object.fromEntries(
    sent.photos.map((photo) => [
      photo.mediaId,
      photo.design === null ? null : (ids.get(photo.design) ?? null),
    ]),
  );
  const shown = new Set(Object.values(product.photoDesigns));
  product.designs = kept
    .filter((design) => shown.has(design.id))
    .sort((a, b) => a.number - b.number);
  product.nextDesignNumber = next;
  const retired = new Set(current.filter((was) => !shown.has(was.id)).map((was) => was.id));
  if (retired.size > 0 && product.matrix) {
    product.matrix = {
      splits: product.matrix.splits.map((split) => ({
        ...split,
        optionIds: split.optionIds.filter((id) => !retired.has(id)),
      })),
      rows: product.matrix.rows.filter((row) => !row.optionIds.some((id) => retired.has(id))),
    };
  }
  return ids;
}

/** A new product's variants name a new design by its key; the key becomes the design's id (PD-16). */
function withDesignIds(body: Record<string, unknown>, ids: ReadonlyMap<string, string>) {
  const swap = (optionIds: unknown) =>
    Array.isArray(optionIds)
      ? (optionIds as unknown[]).map((id): unknown => ids.get(String(id)) ?? id)
      : optionIds;
  return {
    ...body,
    variantAttributes: Array.isArray(body.variantAttributes)
      ? (body.variantAttributes as Record<string, unknown>[]).map((entry) => ({
          ...entry,
          optionIds: swap(entry.optionIds),
        }))
      : body.variantAttributes,
    variants: Array.isArray(body.variants)
      ? (body.variants as Record<string, unknown>[]).map((row) => ({
          ...row,
          optionIds: swap(row.optionIds),
        }))
      : body.variants,
  };
}

/** The settings part of the detail: the saved ones, the policy in effect, the chart and the zones. */
function settingsPart(product: ProductFixture, fixture: ProductsFixture): Record<string, unknown> {
  const settings = { ...SETTINGS, ...product.settings };
  const own = settings.paymentPolicy ?? null;
  return {
    ...settings,
    batchTracked: settings.batchTracked === true,
    effectivePaymentPolicy: own ?? 'none',
    effectiveAdvanceAmount: own === null ? null : settings.advanceAmount,
    sizeChart: chartView(product, fixture),
    deliveryZoneIds: product.zoneIds ?? [],
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

/** CMB-01: a combo's parts as sent, as they are kept. */
const sentParts = (parts: unknown) =>
  (parts as { quantity: number; variantIds: string[] }[]).map((part) => ({
    quantity: part.quantity.toFixed(3),
    variantIds: part.variantIds,
  }));

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
      brand: item.brand ?? false,
      pastOrders: fixture.pastOrders?.[id] ?? 0,
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
  if (method === 'POST' && path === '/products/combo-quote') {
    return { data: comboQuote(body, fixture.picker ?? [], language) };
  }
  const named = (value: unknown): [string, string] => [String(value), String(value)];
  const variants = variantWrite(method, path, body, fixture, (product) =>
    productDetail(product, language, fixture),
  );
  if (variants) return variants;
  if (method === 'POST' && path === '/media/uploads') {
    // The logo's upload is Settings' own (support/settings.ts).
    const purpose = body?.purpose;
    // §7.43: a size chart's and a category's picture too.
    const pictures = [
      'product_image',
      'product_video',
      'swatch_image',
      'size_chart_image',
      'category_image',
    ];
    if (typeof purpose !== 'string' || !pictures.includes(purpose)) {
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
  if (method === 'POST' && path === '/serials/check') {
    const entered = (body?.serials as string[] | undefined) ?? [];
    return { data: { taken: entered.filter((each) => fixture.takenSerials?.includes(each)) } };
  }
  if (method === 'POST' && path === '/products') {
    if (full(fixture)) return { refused: LIMIT_REACHED(fixture) };
    if (fixture.refuse?.name && body?.name === fixture.refuse.name) {
      return { refused: fieldRefusal('name', 'A product already has that name.') };
    }
    const categoryIds = (body?.categoryIds as string[] | undefined) ?? [];
    const product: ProductFixture = {
      ...(body?.kind === 'combo'
        ? {
            kind: 'combo' as const,
            stockTracking: 'not_tracked' as const,
            parts: sentParts(body.parts),
          }
        : {}),
      taxClassId:
        body && 'taxClassId' in body
          ? (body.taxClassId as string | null)
          : (fixture.tax ?? drawnTax()).defaultId,
      modifierGroups: (body?.modifierGroups as ProductFixture['modifierGroups']) ?? [],
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
      zoneIds: (body?.deliveryZoneIds as string[] | undefined) ?? [],
      chart: (body?.sizeChart as ProductFixture['chart'] | undefined) ?? null,
    };
    if (body) {
      saveSettings(product, body);
      // ATR-19 (PD-16): its photos with their designs, then the variants naming them.
      const ids = Array.isArray(body.photos)
        ? savePhotos(product, body as unknown as SentPhotos)
        : new Map<string, string>();
      createdMatrix(product, withDesignIds(body, ids), fixture);
    }
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
    if (body && 'taxClassId' in body) product.taxClassId = body.taxClassId as string | null;
    if (Array.isArray(body?.modifierGroups)) {
      product.modifierGroups = body.modifierGroups as ProductFixture['modifierGroups'];
    }
    if (Array.isArray(body?.parts)) {
      const parts = sentParts(body.parts);
      const gone = retiredField(parts, fixture.picker ?? []);
      if (gone) return { refused: fieldRefusal(gone, 'Choose a variant that is on sale.') };
      product.parts = parts;
    }
    if (body) saveSettings(product, body);
    return answer();
  }
  if (method === 'PUT' && part === '/delivery-zones') {
    product.zoneIds = (body?.zoneIds as string[] | undefined) ?? [];
    return answer();
  }
  // PRD-17: the chart's own routes answer the chart, not the product.
  if (method === 'PUT' && part === '/size-chart') {
    product.chart = body as ProductFixture['chart'];
    return { data: chartView(product, fixture) };
  }
  if (method === 'DELETE' && part === '/size-chart') {
    product.chart = null;
    return { data: { ok: true } };
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
    if (Array.isArray(body?.photos)) savePhotos(product, body as unknown as SentPhotos);
    else {
      // As before: every photo plain, so every design goes (PD-16).
      savePhotos(product, {
        photos: ((body?.mediaIds as string[] | undefined) ?? []).map((mediaId) => ({
          mediaId,
          design: null,
        })),
        designs: [],
      });
    }
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
