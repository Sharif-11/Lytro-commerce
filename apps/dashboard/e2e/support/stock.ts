import type { Language } from './mock-api';
import {
  drawnProducts,
  nameIn,
  type ProductFixture,
  type ProductRefusal,
  type ProductsFixture,
} from './products';
import { matrixOf, stockAnswer, variantPart, type VariantFixture } from './variants';

// A product's Stock card against a mocked API (Slice 11.7c step 3): each variant's movements, the product's batches,
// a variant's serials by status, and the writes -- stock added, a batch written off, serials added, one fixed or
// removed -- each changing the fixture, so the reads after them show what was done. The Stock page (Slice 11.9) reads
// the products a page at a time with its figures and the batches expiring, and writes Edit stock and Average cost.

export interface SerialFixture {
  id: string;
  serial: string;
  status: 'in_stock' | 'sold' | 'returned' | 'written_off';
}

export interface BatchFixture {
  id: string;
  variantId: string;
  optionIds: string[];
  batchCode: string | null;
  expiresOn: string | null;
  quantity: string;
  state: 'fine' | 'expiring' | 'expired';
}

export interface MovementFixture {
  id: number;
  delta: string;
  onHandAfter: string;
  reason: string;
  note: string | null;
  actor: { userId: string; name: string } | null;
  createdAt: string;
}

const RUMANA = { userId: 'u-rumana', name: 'Rumana' };

const DAY_MS = 24 * 60 * 60 * 1000;
// Dhaka is six hours ahead of UTC all year.
const DHAKA_MS = 6 * 60 * 60 * 1000;

/**
 * A day as an expiry is written (YYYY-MM-DD), so many days from today in Dhaka, as the dashboard counts days: a UTC day
 * was one behind from midnight to 6 am there, and "13 days left" read 12.
 */
const dayFromNow = (days: number): string =>
  new Date(Date.now() + DHAKA_MS + days * DAY_MS).toISOString().slice(0, 10);
const PAGE = 20;
let made = 0;

/** The product's variants, kept on the fixture so a write stays written. */
function rowsOf(product: ProductFixture): VariantFixture[] {
  product.matrix ??= matrixOf(product);
  return product.matrix.rows;
}

/** A variant's movements: its own, else what it holds as its opening stock, two months ago. */
function historyOf(product: ProductFixture, variantId: string): MovementFixture[] {
  const all = (product.history ??= {});
  if (!all[variantId]) {
    const onHand = rowsOf(product).find((row) => row.id === variantId)?.onHand ?? 0;
    all[variantId] = [
      {
        id: (made += 1),
        delta: String(onHand),
        onHandAfter: String(onHand),
        reason: 'initial',
        note: null,
        actor: RUMANA,
        createdAt: new Date(Date.now() - 60 * DAY_MS).toISOString(),
      },
    ];
  }
  return all[variantId];
}

/** A change recorded, newest first. */
function record(
  product: ProductFixture,
  variantId: string,
  delta: number,
  onHandAfter: number,
  reason: string,
  note: string | null,
): void {
  historyOf(product, variantId).unshift({
    id: (made += 1),
    delta: String(delta),
    onHandAfter: String(onHandAfter),
    reason,
    note,
    actor: RUMANA,
    createdAt: new Date().toISOString(),
  });
}

const page = <T>(items: T[], at: number) => ({
  page: at,
  limit: PAGE,
  total: items.length,
  pages: Math.max(1, Math.ceil(items.length / PAGE)),
  slice: items.slice((at - 1) * PAGE, at * PAGE),
});

const productOf = (fixture: ProductsFixture, id: string | undefined) =>
  fixture.products.find((each) => each.id === id);

/** The Stock card's reads; undefined for any other path. */
export function stockRead(path: string, url: URL, fixture: ProductsFixture): unknown {
  const history = /^\/products\/([^/]+)\/variants\/([^/]+)\/stock-history$/.exec(path);
  const ofHistory = productOf(fixture, history?.[1]);
  if (history && ofHistory) {
    const { slice, ...rest } = page(
      historyOf(ofHistory, history[2] ?? ''),
      Number(url.searchParams.get('page') ?? 1),
    );
    return { movements: slice, ...rest };
  }
  const batches = /^\/products\/([^/]+)\/batches$/.exec(path);
  const ofBatches = productOf(fixture, batches?.[1]);
  if (batches && ofBatches) return { productId: ofBatches.id, batches: ofBatches.batches ?? [] };
  const serials = /^\/products\/([^/]+)\/variants\/([^/]+)\/serials$/.exec(path);
  const ofSerials = productOf(fixture, serials?.[1]);
  if (serials && ofSerials) {
    const status = url.searchParams.get('status') ?? 'in_stock';
    const row = rowsOf(ofSerials).find((each) => each.id === serials[2]);
    const listed = (row?.serials ?? [])
      .filter((each) => each.status === status)
      .map((each) => ({ ...each, variantId: row?.id ?? '' }));
    const { slice, ...rest } = page(listed, 1);
    return { serials: slice, ...rest };
  }
  return undefined;
}

/** INV-06: what each one-tap reason records. */
const EDIT_REASONS: Record<string, string> = {
  new_stock: 'purchase_receipt',
  counted_again: 'recount',
  damaged_or_lost: 'damaged',
  other: 'manual_adjustment',
};

/** Design v3.7: out first, then low or with a variant low or out, then the rest, each in the fixture's order. */
function rankOf(product: ProductFixture): number {
  if (product.stockState === 'out') return 0;
  if (product.stockTracking === 'not_tracked') return 2;
  const { variants } = stockAnswer(product) as { variants: { state: string }[] };
  return product.stockState === 'low' || variants.some((each) => each.state !== 'in') ? 1 : 2;
}

/** GET /inventory/stock (Slice 11.9): the products found by name, out and low first, with All, Low and Out counted. */
export function stockPageAnswer(fixture: ProductsFixture, url: URL, language: Language): unknown {
  const search = (url.searchParams.get('search') ?? '').toLowerCase();
  const stock = url.searchParams.get('stock');
  const categoryId = url.searchParams.get('categoryId');
  const filedIn = (product: ProductFixture) =>
    categoryId === null ||
    (categoryId === 'uncategorized'
      ? product.primaryCategoryId === null
      : (product.categoryIds ?? [product.primaryCategoryId]).includes(categoryId));
  const at = Number(url.searchParams.get('page') ?? 1);
  const live = fixture.products.filter((product) => !product.archived);
  const found = live.filter(
    (product) =>
      filedIn(product) &&
      (search === '' || product.name.some((name) => name.toLowerCase().includes(search))),
  );
  const picked = found
    .filter((product) => stock === null || (product.active && product.stockState === stock))
    .map((product, index) => ({ product, index }))
    .sort((a, b) => rankOf(a.product) - rankOf(b.product) || a.index - b.index)
    .map((each) => each.product);
  const { slice, ...rest } = page(picked, at);
  const counted = (state: string) =>
    found.filter((product) => product.active && product.stockState === state).length;
  return {
    products: slice.map((product) => ({
      ...(stockAnswer(product) as object),
      name: nameIn(product, language),
      active: product.active,
      batchTracked: product.settings?.batchTracked === true,
      serialTracked: product.serialTracked ?? false,
      serialFormat: (product.settings?.serialFormat as string | undefined) ?? 'any',
      splits: variantPart(product, fixture).variantAttributes,
    })),
    ...rest,
    counts: { all: found.length, low: counted('low'), out: counted('out') },
  };
}

/** GET /inventory/figures (INV-18): the sketch's month, unless the fixture says otherwise. */
export function figuresAnswer(fixture: ProductsFixture, language: Language): unknown {
  const figures = fixture.figures ?? {
    stockValue: '84350.00',
    costOfGoodsSold: '21680.00',
    losses: '1890.00',
    byReason: [
      { reason: 'damaged', movements: 2 },
      { reason: 'lost', movements: 1 },
    ],
  };
  const today = new Date().toISOString().slice(0, 10);
  const pieces = (quantity: number) => [{ unit: 'piece', quantity: String(quantity) }];
  return {
    dateFrom: `${today.slice(0, 8)}01`,
    dateTo: today,
    stockValue: {
      value: figures.stockValue,
      unknownCost: 0,
      units: pieces(412),
      byCategory: byCategoryOf(language),
    },
    costOfGoodsSold: { value: figures.costOfGoodsSold, movements: 12, unknownCost: 0 },
    losses: {
      value: figures.losses,
      movements: figures.byReason.reduce((total, each) => total + each.movements, 0),
      unknownCost: 0,
      // The sketch's month: what each reason took, at average cost.
      byReason: figures.byReason.map((each, at) => ({
        ...each,
        value: at === 0 ? '1240.00' : '650.00',
        unknownCost: 0,
        units: pieces(each.movements),
      })),
    },
  };
}

/** The stock value by top-level category, as the sketch's `stock-value` gives it; null for the products in none. */
function byCategoryOf(language: Language): unknown[] {
  const bn = language === 'bn';
  return (
    [
      ['c-jackets', 'জ্যাকেট', 'Jackets', '38500.00'],
      ['c-sarees', 'শাড়ি', 'Sarees', '54000.00'],
      ['c-tshirts', 'টি-শার্ট', 'T-shirts', '18200.00'],
      [null, null, null, '11500.00'],
    ] as const
  ).map(([categoryId, nameBn, nameEn, value]) => ({
    categoryId,
    name: categoryId === null ? null : bn ? nameBn : nameEn,
    value,
    unknownCost: 0,
    units: [],
  }));
}

/** GET /batches?state= (INV-13): the shop's batches expiring or expired, as far as the page counts them. */
export function shopBatchesAnswer(
  fixture: ProductsFixture,
  url: URL,
  language: Language,
  costs: boolean,
): unknown {
  const state = url.searchParams.get('state');
  const live = fixture.products.filter((product) => !product.archived);
  const batches = live
    .flatMap((product) =>
      (product.batches ?? []).map((batch) => ({
        ...batch,
        productId: product.id,
        productName: nameIn(product, language),
        stockUnit: product.stockUnit ?? 'piece',
        ...(costs
          ? { avgCost: rowsOf(product).find((row) => row.id === batch.variantId)?.avgCost ?? null }
          : {}),
      })),
    )
    .filter((batch) => (state ? batch.state === state : batch.state !== 'fine'))
    .sort((a, b) => (a.expiresOn ?? '').localeCompare(b.expiresOn ?? ''));
  const { slice, ...rest } = page(batches, 1);
  const listed = [...new Set(slice.map((batch) => batch.productId))];
  return {
    batches: slice,
    products: live
      .filter((product) => listed.includes(product.id))
      .map((product) => ({
        productId: product.id,
        splits: variantPart(product, fixture).variantAttributes,
      })),
    ...rest,
  };
}

/**
 * Expiring as the prototype's `expiring` draws it: the face cream's FC-0921 in 13 days and FC-0702 expired, and a lip
 * balm's LB-0818 in 25 days.
 */
export function expiringShop(): ProductsFixture {
  const cream = creamShop();
  const balm: ProductFixture = {
    id: 'p-lb',
    name: ['লিপ বাম', 'Lip balm'],
    basePrice: '250.00',
    active: true,
    stockState: 'in',
    primaryCategoryId: null,
    variantCount: 1,
    settings: { batchTracked: true },
    matrix: {
      splits: [],
      rows: [{ id: 'p-lb-v1', optionIds: [], price: null, sku: null, onHand: 6, avgCost: '90.00' }],
    },
    batches: [
      {
        id: 'b-lb',
        variantId: 'p-lb-v1',
        optionIds: [],
        batchCode: 'LB-0818',
        expiresOn: dayFromNow(25),
        quantity: '6',
        state: 'expiring',
      },
    ],
  };
  return {
    ...cream,
    products: [...cream.products.filter((each) => each.id === 'p-fc'), balm],
  };
}

/** The Stock card's writes; undefined for any other request. */
export function stockWrite(
  method: string,
  path: string,
  body: Record<string, unknown> | null,
  fixture: ProductsFixture,
): { data: unknown } | { refused: ProductRefusal } | undefined {
  const added = /^\/products\/([^/]+)\/variants\/([^/]+)\/stock-additions$/.exec(path);
  const ofAdded = productOf(fixture, added?.[1]);
  if (method === 'POST' && added && ofAdded) {
    const quantity = Number(body?.quantity ?? 0);
    const variantId = added[2] ?? '';
    const note = typeof body?.supplierName === 'string' ? body.supplierName : null;
    if (variantId === `${ofAdded.id}-shared`) {
      ofAdded.sharedOnHand = (ofAdded.sharedOnHand ?? 0) + quantity;
      record(ofAdded, variantId, quantity, ofAdded.sharedOnHand, 'purchase_receipt', note);
      return { data: stockAnswer(ofAdded) };
    }
    const row = rowsOf(ofAdded).find((each) => each.id === variantId);
    if (!row) return undefined;
    row.onHand = (row.onHand ?? 0) + quantity;
    for (const serial of (body?.serials as string[] | undefined) ?? []) {
      (row.serials ??= []).push({
        id: `sn-new-${String((made += 1))}`,
        serial,
        status: 'in_stock',
      });
    }
    const batch = body?.batch as { batchCode?: string; expiresOn?: string } | undefined;
    if (batch || ofAdded.batches) {
      (ofAdded.batches ??= []).push({
        id: `b-new-${String((made += 1))}`,
        variantId,
        optionIds: row.optionIds,
        batchCode: batch?.batchCode ?? null,
        expiresOn: batch?.expiresOn ?? null,
        quantity: String(quantity),
        state: 'fine',
      });
    }
    record(ofAdded, variantId, quantity, row.onHand, 'purchase_receipt', note);
    return { data: stockAnswer(ofAdded) };
  }
  // Slice 11.9: Edit stock -- the number now held, the batch it leaves or joins, the serials leaving.
  const set = /^\/products\/([^/]+)\/variants\/([^/]+)\/stock$/.exec(path);
  const ofSet = productOf(fixture, set?.[1]);
  const setRow = ofSet ? rowsOf(ofSet).find((each) => each.id === set?.[2]) : undefined;
  if (method === 'PUT' && ofSet && setRow) {
    const onHand = Number(body?.onHand ?? 0);
    const change = onHand - (setRow.onHand ?? 0);
    setRow.onHand = onHand;
    const leaving = (body?.serials as string[] | undefined) ?? [];
    for (const unit of setRow.serials ?? []) {
      if (leaving.includes(unit.serial)) unit.status = 'written_off';
    }
    const own = (ofSet.batches ?? []).filter((each) => each.variantId === setRow.id);
    const named = own.find((each) => each.id === body?.batchId);
    const batch = body?.batch as { batchCode?: string; expiresOn?: string } | undefined;
    const from = named ?? own[0];
    if (change < 0 && from) {
      from.quantity = String(Number(from.quantity) + change);
    } else if (change > 0 && named) {
      named.quantity = String(Number(named.quantity) + change);
    } else if (change > 0 && ofSet.batches) {
      ofSet.batches.push({
        id: `b-new-${String((made += 1))}`,
        variantId: setRow.id,
        optionIds: setRow.optionIds,
        batchCode: batch?.batchCode ?? null,
        expiresOn: batch?.expiresOn ?? null,
        quantity: String(change),
        state: 'fine',
      });
    }
    const note = typeof body?.note === 'string' ? body.note : null;
    const asked = typeof body?.reason === 'string' ? body.reason : 'other';
    const reason = EDIT_REASONS[asked] ?? 'manual_adjustment';
    record(ofSet, setRow.id, change, onHand, reason, note);
    return { data: stockAnswer(ofSet) };
  }
  // Slice 11.9: Average cost typed by hand; null is unknown.
  const cost = /^\/products\/([^/]+)\/variants\/([^/]+)\/cost$/.exec(path);
  const ofCost = productOf(fixture, cost?.[1]);
  const costRow = ofCost ? rowsOf(ofCost).find((each) => each.id === cost?.[2]) : undefined;
  if (method === 'PUT' && ofCost && costRow) {
    const avgCost = body?.avgCost;
    costRow.avgCost = typeof avgCost === 'number' ? avgCost.toFixed(2) : null;
    return { data: stockAnswer(ofCost) };
  }
  const writeOff = /^\/products\/([^/]+)\/batches\/([^/]+)\/write-off$/.exec(path);
  const ofWriteOff = productOf(fixture, writeOff?.[1]);
  const going = ofWriteOff?.batches?.find((each) => each.id === writeOff?.[2]);
  if (method === 'POST' && ofWriteOff && going) {
    ofWriteOff.batches = (ofWriteOff.batches ?? []).filter((each) => each !== going);
    const row = rowsOf(ofWriteOff).find((each) => each.id === going.variantId);
    const quantity = Number(going.quantity);
    if (row) {
      row.onHand = (row.onHand ?? 0) - quantity;
      record(ofWriteOff, row.id, -quantity, row.onHand, 'expired', null);
    }
    return { data: { productId: ofWriteOff.id, batches: ofWriteOff.batches } };
  }
  const serials = /^\/products\/([^/]+)\/variants\/([^/]+)\/serials$/.exec(path);
  const ofSerials = productOf(fixture, serials?.[1]);
  const row = ofSerials ? rowsOf(ofSerials).find((each) => each.id === serials?.[2]) : undefined;
  if (method === 'POST' && row) {
    for (const serial of (body?.serials as string[] | undefined) ?? []) {
      (row.serials ??= []).push({
        id: `sn-new-${String((made += 1))}`,
        serial,
        status: 'in_stock',
      });
    }
    const listed = (row.serials ?? []).map((each) => ({ ...each, variantId: row.id }));
    return { data: { serials: listed, page: 1, limit: PAGE, total: listed.length, pages: 1 } };
  }
  const one = /^\/products\/([^/]+)\/serials\/([^/]+)$/.exec(path);
  const ofOne = productOf(fixture, one?.[1]);
  const owner = ofOne
    ? rowsOf(ofOne).find((each) => each.serials?.some((unit) => unit.id === one?.[2]))
    : undefined;
  const unit = owner?.serials?.find((each) => each.id === one?.[2]);
  if (method === 'PATCH' && owner && unit) {
    const serial = typeof body?.serial === 'string' ? body.serial : '';
    if (fixture.takenSerials?.includes(serial)) {
      return {
        refused: {
          status: 409,
          code: 'conflict',
          message: 'That serial is already in the shop.',
          details: {},
        },
      };
    }
    unit.serial = serial;
    return { data: { ...unit, variantId: owner.id } };
  }
  if (method === 'DELETE' && owner && unit) {
    owner.serials = (owner.serials ?? []).filter((each) => each !== unit);
    return { data: { ok: true } };
  }
  return undefined;
}

/** Valid IMEIs, the check digit right, for the fixtures and the tests. */
export const SAMPLE_IMEIS = [
  '356789104567894',
  '356789104567902',
  '356789104567910',
  '356789104567928',
];

/** A phone shop's Galaxy A16 in 128 and 256 GB: 3 and 2 held, one unit of each without a serial. */
export function phoneShop(taken: string[] = []): ProductsFixture {
  const products = drawnProducts();
  const phone: ProductFixture = {
    id: 'p-ph',
    name: ['Galaxy A16', 'Galaxy A16'],
    basePrice: '21500.00',
    active: true,
    stockState: 'in',
    primaryCategoryId: null,
    variantCount: 2,
    serialTracked: true,
    settings: { serialFormat: 'imei' },
    matrix: {
      splits: [{ attributeId: 'a-1', optionIds: ['o-1-128 GB', 'o-1-256 GB'] }],
      rows: [
        {
          id: 'p-ph-v1',
          optionIds: ['o-1-128 GB'],
          price: null,
          sku: null,
          onHand: 3,
          serials: [
            { id: 'sn-1', serial: SAMPLE_IMEIS[0] ?? '', status: 'in_stock' },
            { id: 'sn-2', serial: SAMPLE_IMEIS[1] ?? '', status: 'in_stock' },
            { id: 'sn-3', serial: '356789104567936', status: 'sold' },
          ],
        },
        {
          id: 'p-ph-v2',
          optionIds: ['o-1-256 GB'],
          price: '24500.00',
          sku: null,
          onHand: 2,
          serials: [{ id: 'sn-4', serial: '356789104567944', status: 'in_stock' }],
        },
      ],
    },
  };
  return { ...products, products: [phone, ...products.products], takenSerials: taken };
}

/** A cosmetics shop's face cream with three batches, one of them expired. */
export function creamShop(): ProductsFixture {
  const products = drawnProducts();
  const cream: ProductFixture = {
    id: 'p-fc',
    name: ['Face cream 50 ml', 'Face cream 50 ml'],
    basePrice: '850.00',
    active: true,
    stockState: 'in',
    primaryCategoryId: null,
    variantCount: 1,
    settings: { batchTracked: true },
    matrix: {
      splits: [],
      rows: [
        { id: 'p-fc-v1', optionIds: [], price: null, sku: null, onHand: 39, avgCost: '120.00' },
      ],
    },
    batches: [
      {
        id: 'b-1',
        variantId: 'p-fc-v1',
        optionIds: [],
        batchCode: 'FC-0702',
        expiresOn: dayFromNow(-18),
        quantity: '3',
        state: 'expired',
      },
      {
        id: 'b-2',
        variantId: 'p-fc-v1',
        optionIds: [],
        batchCode: 'FC-0921',
        expiresOn: dayFromNow(13),
        quantity: '12',
        state: 'expiring',
      },
      {
        id: 'b-3',
        variantId: 'p-fc-v1',
        optionIds: [],
        batchCode: 'FC-1102',
        expiresOn: dayFromNow(160),
        quantity: '24',
        state: 'fine',
      },
    ],
  };
  return { ...products, products: [cream, ...products.products] };
}

/** A variant of a fixture: its options, what it holds, what waits to ship and what is coming. */
const held = (
  id: string,
  optionIds: string[],
  onHand: number,
  more: Partial<VariantFixture> = {},
): VariantFixture => ({ id, optionIds, price: null, sku: null, onHand, ...more });

/** Where the Stock page's products are filed, by id. */
const FILED: Record<string, string> = {
  'p-1': 'c-tshirts',
  'p-2': 'c-jackets',
  'p-3': 'c-sarees',
  'p-4': 'c-kids',
  'p-5': 'c-jackets',
  'p-6': 'c-accessories',
};

/**
 * The Stock page as the prototype's `stock` and Part 20's `stock-fine-open` draw it (Slice 11.9): the denim jacket's S
 * and M low, the kids' frock out, the T-shirt's ten variants with M Black coming and XXL Blue low; the silk saree, the
 * hoodie and the scarf fine; a custom panjabi made to order.
 */
export function stockShop(language: Language = 'en'): ProductsFixture {
  // The colours as the shop typed them, in the sketch's language.
  const word = (en: string, bn: string): string => (language === 'bn' ? bn : en);
  const [black, blue, pink, red] = [
    word('Black', 'কালো'),
    word('Blue', 'নীল'),
    word('Pink', 'গোলাপি'),
    word('Red', 'লাল'),
  ];
  const sizes = ['S', 'M', 'L', 'XL', 'XXL'];
  const tshirt: Record<string, [number, Partial<VariantFixture>?]> = {
    [`S-${black}`]: [8],
    [`M-${black}`]: [14, { reserved: 2, incoming: 20 }],
    [`L-${black}`]: [9],
    [`XL-${black}`]: [6],
    [`XXL-${black}`]: [7],
    [`S-${blue}`]: [9],
    [`M-${blue}`]: [8],
    [`L-${blue}`]: [6],
    [`XL-${blue}`]: [7],
    [`XXL-${blue}`]: [2],
  };
  const product = (
    id: string,
    name: [string, string],
    splits: { attributeId: string; optionIds: string[] }[],
    rows: VariantFixture[],
    more: Partial<ProductFixture> = {},
  ): ProductFixture => ({
    id,
    name,
    basePrice: '500.00',
    active: true,
    stockState: 'in',
    // Filed as the drawn shop files them, so a stock check can count a category whole.
    primaryCategoryId: FILED[id] ?? null,
    variantCount: rows.length,
    matrix: { splits, rows },
    ...more,
  });
  return {
    limit: 100,
    products: [
      product(
        'p-2',
        ['ডেনিম জ্যাকেট', 'Denim jacket'],
        [{ attributeId: 'a-1', optionIds: ['o-1-S', 'o-1-M', 'o-1-L', 'o-1-XL'] }],
        [
          held('p-2-v1', ['o-1-S'], 3, { avgCost: '1240.00' }),
          held('p-2-v2', ['o-1-M'], 5, { reserved: 1, avgCost: '1240.00' }),
          held('p-2-v3', ['o-1-L'], 14, { reserved: 2, avgCost: '1240.00' }),
          held('p-2-v4', ['o-1-XL'], 7, { avgCost: '1240.00' }),
        ],
      ),
      product(
        'p-4',
        ['কিডস ফ্রক', 'Kids frock'],
        [
          { attributeId: 'a-1', optionIds: ['o-1-2–3', 'o-1-4–5'] },
          { attributeId: 'a-2', optionIds: [`o-2-${pink}`] },
        ],
        [
          held('p-4-v1', ['o-1-2–3', `o-2-${pink}`], 0, { avgCost: '410.00' }),
          held('p-4-v2', ['o-1-4–5', `o-2-${pink}`], 2, { reserved: 2, avgCost: '410.00' }),
        ],
        { stockState: 'out' },
      ),
      product(
        'p-1',
        ['কটন টি-শার্ট', 'Cotton T-shirt'],
        [
          { attributeId: 'a-1', optionIds: sizes.map((size) => `o-1-${size}`) },
          { attributeId: 'a-2', optionIds: [`o-2-${black}`, `o-2-${blue}`] },
        ],
        [black, blue].flatMap((colour, shade) =>
          sizes.map((size, at) => {
            const [onHand, more] = tshirt[`${size}-${colour}`] ?? [0];
            return held(
              `p-1-v${String(shade * sizes.length + at + 1)}`,
              [`o-1-${size}`, `o-2-${colour}`],
              onHand,
              { avgCost: '280.00', ...more },
            );
          }),
        ),
      ),
      product(
        'p-3',
        ['সিল্ক শাড়ি', 'Silk saree'],
        [],
        [held('p-3-v1', [], 7, { reserved: 1, avgCost: '2450.00' })],
      ),
      product(
        'p-5',
        ['হুডি', 'Hoodie'],
        [{ attributeId: 'a-1', optionIds: ['o-1-S', 'o-1-M', 'o-1-L', 'o-1-XL'] }],
        ['S', 'M', 'L', 'XL'].map((size, at) =>
          held(`p-5-v${String(at + 1)}`, [`o-1-${size}`], 8, { avgCost: '950.00' }),
        ),
        { active: false },
      ),
      product(
        'p-6',
        ['স্কার্ফ', 'Scarf'],
        [{ attributeId: 'a-2', optionIds: [`o-2-${red}`, `o-2-${blue}`] }],
        [
          held('p-6-v1', [`o-2-${red}`], 14, { avgCost: '180.00' }),
          held('p-6-v2', [`o-2-${blue}`], 9, { avgCost: '180.00' }),
        ],
      ),
      product('p-9', ['কাস্টম পাঞ্জাবি', 'Custom panjabi'], [], [held('p-9-v1', [], 0)], {
        stockTracking: 'not_tracked',
      }),
    ],
  };
}

/**
 * A gadget shop's Galaxy A15 in 128 GB Black (Part 20's `stock-row-sheet-serial`, `stock-edit-down-serial`): five on
 * hand, `missing` of them without an IMEI yet, its average cost not set.
 */
export function galaxyShop(language: Language = 'en', missing = 0): ProductsFixture {
  const black = language === 'bn' ? 'কালো' : 'Black';
  const imeis = [
    '357812094561234',
    '357812094561242',
    '357812094561259',
    '357812094561267',
    '357812094561275',
  ];
  return {
    limit: 100,
    products: [
      {
        id: 'p-ga',
        name: ['Galaxy A15', 'Galaxy A15'],
        basePrice: '18500.00',
        active: true,
        stockState: 'in',
        primaryCategoryId: null,
        variantCount: 1,
        serialTracked: true,
        settings: { serialFormat: 'imei' },
        matrix: {
          splits: [
            { attributeId: 'a-1', optionIds: ['o-1-128 GB'] },
            { attributeId: 'a-2', optionIds: [`o-2-${black}`] },
          ],
          rows: [
            held('p-ga-v1', ['o-1-128 GB', `o-2-${black}`], 5, {
              serials: imeis.slice(0, 5 - missing).map((serial, at) => ({
                id: `sn-ga-${String(at + 1)}`,
                serial,
                status: 'in_stock' as const,
              })),
            }),
          ],
        },
      },
    ],
  };
}
