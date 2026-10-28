import {
  drawnProducts,
  type ProductFixture,
  type ProductRefusal,
  type ProductsFixture,
} from './products';
import { matrixOf, stockAnswer, type VariantFixture } from './variants';

// A product's Stock card against a mocked API (Slice 11.7c step 3): each variant's movements, the product's batches,
// a variant's serials by status, and the writes -- stock added, a batch written off, serials added, one fixed or
// removed -- each changing the fixture, so the reads after them show what was done.

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

/** A day as an expiry is written (YYYY-MM-DD), so many days from today. */
const dayFromNow = (days: number): string =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const DAY_MS = 24 * 60 * 60 * 1000;
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
