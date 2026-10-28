import type { Language } from './mock-api';
import type { ProductFixture, ProductsFixture } from './products';
import { matrixOf, variantPart, type VariantFixture } from './variants';

// Purchases and suppliers against a mocked API (Slice 11.10; PUR-01 to PUR-10): the shop's suppliers, its purchases in
// every state as Part 21 draws them on the Stock page's products, and the writes -- a typed supplier found or made, a
// purchase placed, cancelled, closed short or deleted, and a delivery received into stock -- so the reads after them
// show what changed.

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SupplierFixture {
  id: string;
  /** As the sketch names it in Bangla and in English; a supplier made in a test has one name for both. */
  name: [string, string];
  phone: string | null;
  email?: string | null;
  postalAddress?: string | null;
  notes?: string | null;
  archived: boolean;
}

export interface PurchaseItemFixture {
  id: string;
  variantId: string;
  ordered: number;
  received: number;
  unitCost: string | null;
}

export interface ReceiptFixture {
  id: string;
  receivedAt: string;
  actor: { userId: string; name: string } | null;
  note: string | null;
  items: {
    itemId: string;
    accepted: number;
    rejected: number;
    rejectReason: string | null;
    unitCost: string | null;
    batchCode?: string | null;
    expiresOn?: string | null;
    serials?: string[];
  }[];
}

export interface PurchaseFixture {
  id: string;
  number: number | null;
  status: 'draft' | 'ordered' | 'partially_received' | 'received' | 'closed_short' | 'cancelled';
  supplierId: string | null;
  expectedOn: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  orderedAt: string | null;
  closeReason: string | null;
  items: PurchaseItemFixture[];
  receipts: ReceiptFixture[];
}

export interface PurchasingFixture {
  suppliers: SupplierFixture[];
  purchases: PurchaseFixture[];
}

const daysAgo = (days: number): string => new Date(Date.now() - days * DAY_MS).toISOString();
const dayOf = (iso: string): string => iso.slice(0, 10);

/** The sketch's suppliers (the prototype's `SUPS`): three live, one archived. */
export function drawnSuppliers(): SupplierFixture[] {
  return [
    {
      id: 's-rahim',
      name: ['রহিম ট্রেডার্স', 'Rahim Traders'],
      phone: '01711000111',
      postalAddress: 'Islampur, Dhaka',
      archived: false,
    },
    {
      id: 's-karim',
      name: ['করিম গার্মেন্টস', 'Karim Garments'],
      phone: '01811000222',
      archived: false,
    },
    { id: 's-alam', name: ['আলম টেক্সটাইল', 'Alam Textile'], phone: null, archived: false },
    {
      id: 's-old',
      name: ['পুরোনো ডিলার', 'Old Dealer'],
      phone: '01911000333',
      archived: true,
    },
  ];
}

/**
 * The sketch's purchases on the Stock page's products (Part 21's `purchases-21`, `purchases-all-21`): PO-0007 ordered
 * from Rahim Traders, PO-0006 partly received from Karim Garments (40 accepted, 2 rejected), PO-0005 received, a draft
 * for Alam Textile, PO-0004 closed short, and PO-0008, Add stock's arrival with no supplier.
 */
export function drawnPurchases(language: Language): PurchaseFixture[] {
  const bn = language === 'bn';
  const rumana = { userId: 'u-rumana', name: bn ? 'রুমানা' : 'Rumana' };
  const purchase = (
    id: string,
    number: number | null,
    status: PurchaseFixture['status'],
    supplierId: string | null,
    days: number,
    items: PurchaseItemFixture[],
    more: Partial<PurchaseFixture> = {},
  ): PurchaseFixture => ({
    id,
    number,
    status,
    supplierId,
    expectedOn: null,
    notes: null,
    createdAt: daysAgo(days + 1),
    updatedAt: daysAgo(days),
    orderedAt: number === null ? null : daysAgo(days),
    closeReason: null,
    items,
    receipts: [],
    ...more,
  });
  return [
    purchase(
      'po-8',
      8,
      'received',
      null,
      0,
      [{ id: 'po-8-i1', variantId: 'p-3-v1', ordered: 10, received: 10, unitCost: null }],
      {
        receipts: [
          {
            id: 'r-8',
            receivedAt: daysAgo(0),
            actor: rumana,
            note: null,
            items: [
              {
                itemId: 'po-8-i1',
                accepted: 10,
                rejected: 0,
                rejectReason: null,
                unitCost: null,
              },
            ],
          },
        ],
      },
    ),
    purchase(
      'po-7',
      7,
      'ordered',
      's-rahim',
      4,
      [
        { id: 'po-7-i1', variantId: 'p-1-v2', ordered: 20, received: 0, unitCost: '280.00' },
        { id: 'po-7-i2', variantId: 'p-1-v3', ordered: 20, received: 0, unitCost: '280.00' },
        { id: 'po-7-i3', variantId: 'p-1-v7', ordered: 10, received: 0, unitCost: null },
      ],
      { expectedOn: dayOf(new Date(Date.now() + 3 * DAY_MS).toISOString()) },
    ),
    purchase(
      'po-6',
      6,
      'partially_received',
      's-karim',
      16,
      [{ id: 'po-6-i1', variantId: 'p-2-v3', ordered: 60, received: 40, unitCost: '1240.00' }],
      {
        receipts: [
          {
            id: 'r-6',
            receivedAt: daysAgo(13),
            actor: rumana,
            note: null,
            items: [
              {
                itemId: 'po-6-i1',
                accepted: 40,
                rejected: 2,
                rejectReason: bn ? 'সেলাই ছেঁড়া' : 'torn seams',
                unitCost: '1240.00',
                batchCode: 'KG-1015',
              },
            ],
          },
        ],
      },
    ),
    purchase(
      'po-draft',
      null,
      'draft',
      's-alam',
      7,
      [{ id: 'po-d-i1', variantId: 'p-6-v1', ordered: 50, received: 0, unitCost: '190.00' }],
      { orderedAt: null },
    ),
    purchase(
      'po-5',
      5,
      'received',
      's-rahim',
      26,
      [{ id: 'po-5-i1', variantId: 'p-3-v1', ordered: 20, received: 20, unitCost: '2450.00' }],
      {
        receipts: [
          {
            id: 'r-5',
            receivedAt: daysAgo(24),
            actor: rumana,
            note: null,
            items: [
              {
                itemId: 'po-5-i1',
                accepted: 20,
                rejected: 0,
                rejectReason: null,
                unitCost: '2450.00',
              },
            ],
          },
        ],
      },
    ),
    purchase(
      'po-4',
      4,
      'closed_short',
      's-karim',
      36,
      [{ id: 'po-4-i1', variantId: 'p-5-v3', ordered: 30, received: 18, unitCost: '950.00' }],
      {
        closeReason: bn
          ? 'সাপ্লায়ারের কাছে বাকি 12টি ছিল না'
          : 'The supplier could not fill the last 12',
        receipts: [
          {
            id: 'r-4',
            receivedAt: daysAgo(34),
            actor: rumana,
            note: null,
            items: [
              {
                itemId: 'po-4-i1',
                accepted: 18,
                rejected: 0,
                rejectReason: null,
                unitCost: '950.00',
              },
            ],
          },
        ],
      },
    ),
  ];
}

/**
 * Part 21's other two states: PO-0009 from Alam Textile, its one delivery rejected in full (`purchase-rejected-only`),
 * and PO-0003, PO-0007's items cancelled before anything came (`purchase-cancelled`).
 */
export function otherStates(language: Language): PurchaseFixture[] {
  const bn = language === 'bn';
  const [seven] = drawnPurchases(language).filter((each) => each.id === 'po-7');
  const day = new Date(Date.now() + 2 * DAY_MS).toISOString();
  return [
    {
      id: 'po-9',
      number: 9,
      status: 'ordered',
      supplierId: 's-alam',
      expectedOn: dayOf(day),
      notes: null,
      createdAt: daysAgo(4),
      updatedAt: daysAgo(2),
      orderedAt: daysAgo(4),
      closeReason: null,
      items: [{ id: 'po-9-i1', variantId: 'p-6-v1', ordered: 50, received: 0, unitCost: '190.00' }],
      receipts: [
        {
          id: 'r-9',
          receivedAt: daysAgo(2),
          actor: { userId: 'u-rumana', name: bn ? 'রুমানা' : 'Rumana' },
          note: null,
          items: [
            {
              itemId: 'po-9-i1',
              accepted: 0,
              rejected: 50,
              rejectReason: bn ? 'রং মেলেনি' : 'wrong shade',
              unitCost: '190.00',
            },
          ],
        },
      ],
    },
    ...(seven
      ? [
          {
            ...seven,
            id: 'po-3',
            number: 3,
            status: 'cancelled' as const,
            expectedOn: null,
            items: seven.items.map((item) => ({ ...item, id: item.id.replace('po-7', 'po-3') })),
          },
        ]
      : []),
  ];
}

/** A variant of the fixture's products, with the product it belongs to. */
function variantOf(
  fixture: ProductsFixture,
  variantId: string,
): { product: ProductFixture; row: VariantFixture } | null {
  for (const product of fixture.products) {
    const row = matrixOf(product).rows.find((each) => each.id === variantId);
    if (row) return { product, row };
  }
  return null;
}

/** The shop's purchasing, the sketch's when the test gives none. */
export function purchasingOf(fixture: ProductsFixture, language: Language): PurchasingFixture {
  return (fixture.purchasing ??= {
    suppliers: drawnSuppliers(),
    purchases: drawnPurchases(language),
  });
}

const amount = (value: number): string => value.toFixed(3);
const money = (value: number): string => value.toFixed(2);

/** UOM-01: amounts summed in each unit. */
function byUnit(amounts: [string, number][]): { unit: string; quantity: string }[] {
  const sums = new Map<string, number>();
  for (const [unit, quantity] of amounts) sums.set(unit, (sums.get(unit) ?? 0) + quantity);
  return [...sums]
    .filter(([, quantity]) => quantity > 0)
    .map(([unit, quantity]) => ({ unit, quantity: amount(quantity) }));
}

function nameOf(supplier: SupplierFixture | undefined, language: Language): string | null {
  if (!supplier) return null;
  return language === 'bn' ? supplier.name[0] : supplier.name[1];
}

/** The total at known costs and how many items have none, for someone who may see costs. */
function costed(items: PurchaseItemFixture[]): { total: string; unknownCost: number } {
  const known = items.filter((item) => item.unitCost !== null);
  return {
    total: money(known.reduce((sum, item) => sum + item.ordered * Number(item.unitCost), 0)),
    unknownCost: items.length - known.length,
  };
}

function unitOf(fixture: ProductsFixture, variantId: string): string {
  return variantOf(fixture, variantId)?.product.stockUnit ?? 'piece';
}

function supplierView(
  purchase: PurchaseFixture,
  purchasing: PurchasingFixture,
  language: Language,
): { id: string; name: string | null } | null {
  const supplier = purchasing.suppliers.find((each) => each.id === purchase.supplierId);
  return supplier ? { id: supplier.id, name: nameOf(supplier, language) } : null;
}

function summaryView(
  purchase: PurchaseFixture,
  fixture: ProductsFixture,
  purchasing: PurchasingFixture,
  language: Language,
  costs: boolean,
): unknown {
  return {
    id: purchase.id,
    number: purchase.number,
    status: purchase.status,
    supplier: supplierView(purchase, purchasing, language),
    expectedOn: purchase.expectedOn,
    createdAt: purchase.createdAt,
    orderedAt: purchase.orderedAt,
    items: purchase.items.length,
    units: byUnit(purchase.items.map((item) => [unitOf(fixture, item.variantId), item.ordered])),
    outstanding: byUnit(
      purchase.items.map((item) => [unitOf(fixture, item.variantId), item.ordered - item.received]),
    ),
    ...(costs ? costed(purchase.items) : {}),
  };
}

/** GET /purchase-orders/:id's answer: the items named by their products' splits, and the deliveries. */
export function purchaseView(
  purchase: PurchaseFixture,
  fixture: ProductsFixture,
  language: Language,
  costs: boolean,
): unknown {
  const purchasing = purchasingOf(fixture, language);
  const products = new Map<string, ProductFixture>();
  const items = purchase.items.map((item) => {
    const held = variantOf(fixture, item.variantId);
    if (held) products.set(held.product.id, held.product);
    const outstanding =
      purchase.status === 'closed_short' || purchase.status === 'cancelled'
        ? 0
        : item.ordered - item.received;
    return {
      id: item.id,
      productId: held?.product.id ?? 'gone',
      variantId: item.variantId,
      productName: held ? held.product.name[language === 'bn' ? 0 : 1] : null,
      optionIds: held?.row.optionIds ?? [],
      sharedStock: held?.product.sharedStock ?? false,
      stockUnit: held?.product.stockUnit ?? 'piece',
      batchTracked: held?.product.settings?.batchTracked === true,
      serialTracked: held?.product.serialTracked ?? false,
      serialFormat: held?.product.serialTracked ? 'imei' : 'none',
      quantityOrdered: amount(item.ordered),
      quantityReceived: amount(item.received),
      outstanding: amount(outstanding),
      ...(costs
        ? {
            unitCost: item.unitCost,
            total: item.unitCost === null ? null : money(item.ordered * Number(item.unitCost)),
          }
        : {}),
    };
  });
  return {
    id: purchase.id,
    number: purchase.number,
    status: purchase.status,
    supplier: supplierView(purchase, purchasing, language),
    expectedOn: purchase.expectedOn,
    notes: purchase.notes,
    createdAt: purchase.createdAt,
    updatedAt: purchase.updatedAt,
    orderedAt: purchase.orderedAt,
    closeReason: purchase.closeReason,
    items,
    products: [...products.values()].map((product) => ({
      productId: product.id,
      splits: variantPart(product, fixture).variantAttributes,
    })),
    receipts: [...purchase.receipts]
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      .map((receipt) => ({
        id: receipt.id,
        receivedAt: receipt.receivedAt,
        actor: receipt.actor,
        note: receipt.note,
        items: receipt.items.map((line) => ({
          itemId: line.itemId,
          accepted: amount(line.accepted),
          rejected: amount(line.rejected),
          rejectReason: line.rejectReason,
          ...(costs ? { unitCost: line.unitCost } : {}),
          batch: line.batchCode
            ? {
                id: `b-${receipt.id}`,
                batchCode: line.batchCode,
                expiresOn: line.expiresOn ?? null,
              }
            : null,
        })),
      })),
    ...(costs ? costed(purchase.items) : {}),
  };
}

/** The supplier a purchase names: picked by its id, or typed, found by name ignoring case or made (Slice 11.10). */
function supplierFor(
  body: Record<string, unknown>,
  purchasing: PurchasingFixture,
  language: Language,
): string | null | undefined {
  if (typeof body.supplierName === 'string') {
    const typed = body.supplierName.trim();
    const found = purchasing.suppliers.find(
      (each) => !each.archived && nameOf(each, language)?.toLowerCase() === typed.toLowerCase(),
    );
    if (found) return found.id;
    const made: SupplierFixture = {
      id: `s-${String(purchasing.suppliers.length + 1)}`,
      name: [typed, typed],
      phone: null,
      archived: false,
    };
    purchasing.suppliers.push(made);
    return made.id;
  }
  if (body.supplierId === null) return null;
  return typeof body.supplierId === 'string' ? body.supplierId : undefined;
}

function itemsOf(body: Record<string, unknown>, purchase: PurchaseFixture): PurchaseItemFixture[] {
  const asked = (body.items ?? []) as {
    variantId: string;
    quantity: number;
    unitCost?: number | null;
  }[];
  return asked.map((line, at) => ({
    id:
      purchase.items.find((item) => item.variantId === line.variantId)?.id ??
      `${purchase.id}-n${String(at)}`,
    variantId: line.variantId,
    ordered: line.quantity,
    received: 0,
    unitCost: line.unitCost === undefined || line.unitCost === null ? null : money(line.unitCost),
  }));
}

/** The purchases' and suppliers' reads and writes; undefined for any other request. */
export function purchasingAnswer(
  method: string,
  path: string,
  url: URL,
  body: Record<string, unknown> | null,
  fixture: ProductsFixture,
  language: Language,
  costs: boolean,
): { data: unknown } | undefined {
  const purchasing = purchasingOf(fixture, language);
  const { purchases, suppliers } = purchasing;
  const now = new Date().toISOString();

  if (method === 'GET' && path === '/purchase-orders') {
    const statuses = url.searchParams.get('status')?.split(',') ?? null;
    const limit = Number(url.searchParams.get('limit') ?? '20');
    const shown = purchases
      .filter((each) => statuses === null || statuses.includes(each.status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const open = purchases.filter(
      (each) => each.status === 'ordered' || each.status === 'partially_received',
    );
    return {
      data: {
        purchaseOrders: shown
          .slice(0, limit)
          .map((each) => summaryView(each, fixture, purchasing, language, costs)),
        page: 1,
        limit,
        total: shown.length,
        pages: 1,
        coming: {
          units: byUnit(
            open.flatMap((each) =>
              each.items.map((item): [string, number] => [
                unitOf(fixture, item.variantId),
                item.ordered - item.received,
              ]),
            ),
          ),
          purchases: open.length,
        },
      },
    };
  }

  if (method === 'POST' && path === '/purchase-orders' && body) {
    const purchase: PurchaseFixture = {
      id: `po-new-${String(purchases.length + 1)}`,
      number: null,
      status: 'draft',
      supplierId: supplierFor(body, purchasing, language) ?? null,
      expectedOn: typeof body.expectedOn === 'string' ? body.expectedOn : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
      createdAt: now,
      updatedAt: now,
      orderedAt: null,
      closeReason: null,
      items: [],
      receipts: [],
    };
    purchase.items = itemsOf(body, purchase);
    purchases.push(purchase);
    return { data: purchaseView(purchase, fixture, language, costs) };
  }

  const one = /^\/purchase-orders\/([^/]+)(?:\/([a-z]+))?$/.exec(path);
  const purchase = purchases.find((each) => each.id === one?.[1]);
  if (one && purchase) {
    const action = one[2];
    const touched = () => {
      // Each write moves the purchase on, as the server's updated_at does.
      purchase.updatedAt = new Date(
        Math.max(Date.now(), Date.parse(purchase.updatedAt) + 1),
      ).toISOString();
      return { data: purchaseView(purchase, fixture, language, costs) };
    };
    if (method === 'GET' && !action)
      return { data: purchaseView(purchase, fixture, language, costs) };
    if (method === 'PATCH' && !action && body) {
      const supplierId = supplierFor(body, purchasing, language);
      if (supplierId !== undefined) purchase.supplierId = supplierId;
      if ('expectedOn' in body) purchase.expectedOn = (body.expectedOn as string | null) ?? null;
      if ('notes' in body) purchase.notes = (body.notes as string | null) ?? null;
      if (Array.isArray(body.items)) purchase.items = itemsOf(body, purchase);
      return touched();
    }
    if (method === 'DELETE' && !action) {
      purchases.splice(purchases.indexOf(purchase), 1);
      return { data: { ok: true } };
    }
    if (method === 'POST' && action === 'place') {
      purchase.number = Math.max(0, ...purchases.map((each) => each.number ?? 0)) + 1;
      purchase.status = 'ordered';
      purchase.orderedAt = now;
      return touched();
    }
    if (method === 'POST' && action === 'cancel') {
      purchase.status = 'cancelled';
      return touched();
    }
    if (method === 'POST' && action === 'close' && body) {
      purchase.status = 'closed_short';
      purchase.closeReason = typeof body.reason === 'string' ? body.reason : null;
      return touched();
    }
    if (method === 'POST' && action === 'receipts' && body) {
      const lines = (body.items ?? []) as {
        itemId: string;
        accepted: number;
        rejected?: number;
        rejectReason?: string;
        unitCost?: number | null;
        batch?: { batchCode?: string; expiresOn?: string };
        serials?: string[];
      }[];
      for (const line of lines) {
        const item = purchase.items.find((each) => each.id === line.itemId);
        if (!item) continue;
        item.received += line.accepted;
        const held = variantOf(fixture, item.variantId);
        if (held) held.row.onHand = (held.row.onHand ?? 0) + line.accepted;
      }
      purchase.receipts.push({
        id: `r-${purchase.id}-${String(purchase.receipts.length + 1)}`,
        receivedAt: now,
        actor: { userId: 'u-rumana', name: language === 'bn' ? 'রুমানা' : 'Rumana' },
        note: typeof body.note === 'string' ? body.note : null,
        items: lines.map((line) => ({
          itemId: line.itemId,
          accepted: line.accepted,
          rejected: line.rejected ?? 0,
          rejectReason: line.rejectReason ?? null,
          unitCost:
            line.unitCost === undefined || line.unitCost === null ? null : money(line.unitCost),
          batchCode: line.batch?.batchCode ?? null,
          expiresOn: line.batch?.expiresOn ?? null,
          ...(line.serials ? { serials: line.serials } : {}),
        })),
      });
      const received = purchase.items.some((item) => item.received > 0);
      const full = purchase.items.every((item) => item.received >= item.ordered);
      purchase.status = full ? 'received' : received ? 'partially_received' : 'ordered';
      return touched();
    }
  }

  if (method === 'GET' && path === '/suppliers') {
    const archived = url.searchParams.get('archived') === 'true';
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const shown = suppliers
      .filter((each) => each.archived === archived)
      .filter((each) => q === '' || (nameOf(each, language) ?? '').toLowerCase().includes(q))
      .sort((a, b) => (nameOf(a, language) ?? '').localeCompare(nameOf(b, language) ?? ''));
    return {
      data: {
        suppliers: shown.map((each) => supplierRead(each, purchases, language)),
        page: 1,
        limit: 100,
        total: shown.length,
        pages: 1,
      },
    };
  }
  if (method === 'POST' && path === '/suppliers' && body) {
    const name = String(body.name);
    const made: SupplierFixture = {
      id: `s-${String(suppliers.length + 1)}`,
      name: [name, name],
      phone: (body.phone as string | undefined) || null,
      email: (body.email as string | undefined) || null,
      postalAddress: (body.postalAddress as string | undefined) || null,
      notes: (body.notes as string | undefined) || null,
      archived: false,
    };
    suppliers.push(made);
    return { data: supplierRead(made, purchases, language) };
  }
  const supplierPath = /^\/suppliers\/([^/]+)$/.exec(path);
  const supplier = suppliers.find((each) => each.id === supplierPath?.[1]);
  if (method === 'PATCH' && supplier && body) {
    if (typeof body.name === 'string') supplier.name = [body.name, body.name];
    if ('phone' in body) supplier.phone = (body.phone as string) || null;
    if ('email' in body) supplier.email = (body.email as string) || null;
    if ('postalAddress' in body) supplier.postalAddress = (body.postalAddress as string) || null;
    if ('notes' in body) supplier.notes = (body.notes as string) || null;
    if (typeof body.archived === 'boolean') supplier.archived = body.archived;
    return { data: supplierRead(supplier, purchases, language) };
  }

  // PUR-09: the deliveries that brought a variant in, newest first.
  const history = /^\/products\/([^/]+)\/variants\/([^/]+)\/purchases$/.exec(path);
  if (method === 'GET' && history) {
    const entries = purchases.flatMap((each) =>
      each.receipts.flatMap((receipt) =>
        receipt.items
          .filter(
            (line) => each.items.find((item) => item.id === line.itemId)?.variantId === history[2],
          )
          .map((line) => ({
            receiptId: `${receipt.id}-${line.itemId}`,
            purchaseOrderId: each.id,
            number: each.number,
            supplier: supplierView(each, purchasing, language),
            receivedAt: receipt.receivedAt,
            accepted: amount(line.accepted),
            rejected: amount(line.rejected),
            rejectReason: line.rejectReason,
            ...(costs ? { unitCost: line.unitCost } : {}),
          })),
      ),
    );
    entries.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    return { data: { purchases: entries, page: 1, limit: 20, total: entries.length, pages: 1 } };
  }
  return undefined;
}

/** A supplier as GET /suppliers lists it, with its last purchase. */
function supplierRead(
  supplier: SupplierFixture,
  purchases: PurchaseFixture[],
  language: Language,
): unknown {
  const last = purchases
    .filter((each) => each.supplierId === supplier.id && each.orderedAt !== null)
    .map((each) => each.orderedAt ?? '')
    .sort()
    .at(-1);
  return {
    id: supplier.id,
    name: nameOf(supplier, language),
    phone: supplier.phone,
    email: supplier.email ?? null,
    postalAddress: supplier.postalAddress ?? null,
    notes: supplier.notes ?? null,
    archived: supplier.archived,
    lastPurchaseAt: last ?? null,
  };
}
