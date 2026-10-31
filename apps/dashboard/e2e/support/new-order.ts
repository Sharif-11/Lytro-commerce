import { LOCATIONS } from './delivery';
import type { Language } from './mock-api';
import type { OrderFixture, OrderItemFixture } from './orders';

// New order and Edit order against a mocked API (Slice 4.8a, part 3): what Add an item finds, as Part 29 draws it --
// the T-shirt in four variants, the denim jacket with one left, the Eid combo with its sizes and gift wrap, the kids
// frock sold out and, found by name, the burger with its add-ons -- the quote of what is typed, the order made from
// it, and the known phone that fills a name and an address.

type Words = [string, string];

interface PickerVariant {
  id: string;
  label: Words;
  price: number;
  /** Units on sale; null when made to order. */
  available: number | null;
}

interface PickerGroup {
  id: string;
  name: Words;
  min: number;
  max: number;
  options: { id: string; name: Words; price: number; isDefault: boolean }[];
}

interface PickerProduct {
  id: string;
  name: Words;
  kind: 'ordinary' | 'combo';
  variants: PickerVariant[];
  /** A combo's parts: one variant is fixed, several a choice (CMB-03). */
  parts?: { position: number; product: Words; variants: PickerVariant[] }[];
  groups?: PickerGroup[];
  /** Clothing, at 5% VAT inside the price (TAX-03). */
  taxed?: boolean;
  /** Listed only when searched for, so the drawn list of four stays as drawn. */
  searchedOnly?: boolean;
}

const BLACK: Words = ['কালো', 'Black'];
const WHITE: Words = ['সাদা', 'White'];
const sized = (size: string, colour?: Words): Words =>
  colour ? [`${size} · ${colour[0]}`, `${size} · ${colour[1]}`] : [size, size];

export const PICKER: PickerProduct[] = [
  {
    id: 'p-tee',
    name: ['কটন টি-শার্ট', 'Cotton T-shirt'],
    kind: 'ordinary',
    taxed: true,
    variants: [
      { id: 'v-tee-m', label: sized('M', BLACK), price: 450, available: 12 },
      { id: 'v-tee-l', label: sized('L', BLACK), price: 450, available: 24 },
      { id: 'v-tee-xl', label: sized('XL', BLACK), price: 480, available: 3 },
      { id: 'v-tee-lw', label: sized('L', WHITE), price: 450, available: 0 },
    ],
  },
  {
    id: 'p-denim',
    name: ['ডেনিম জ্যাকেট', 'Denim jacket'],
    kind: 'ordinary',
    taxed: true,
    variants: [
      { id: 'v-denim-m', label: sized('M'), price: 1890, available: 1 },
      { id: 'v-denim-l', label: sized('L'), price: 1890, available: 0 },
    ],
  },
  {
    id: 'p-eid',
    name: ['ঈদ কম্বো', 'Eid combo'],
    kind: 'combo',
    variants: [{ id: 'v-eid', label: ['', ''], price: 2450, available: 6 }],
    parts: [
      {
        position: 1,
        product: ['কটন পাঞ্জাবি', 'Cotton panjabi'],
        variants: [
          { id: 'v-pj-s', label: sized('S'), price: 0, available: 4 },
          { id: 'v-pj-m', label: sized('M'), price: 0, available: 9 },
          { id: 'v-pj-l', label: sized('L'), price: 0, available: 7 },
          { id: 'v-pj-xl', label: sized('XL'), price: 0, available: 2 },
          { id: 'v-pj-xxl', label: sized('XXL'), price: 0, available: 0 },
        ],
      },
      {
        position: 2,
        product: ['চেক লুঙ্গি', 'Check lungi'],
        variants: [{ id: 'v-lungi', label: ['', ''], price: 0, available: 30 }],
      },
    ],
    groups: [
      {
        id: 'g-wrap',
        name: ['অ্যাড-অন', 'Add-ons'],
        min: 0,
        max: 1,
        options: [{ id: 'o-wrap', name: ['গিফট র‍্যাপ', 'Gift wrap'], price: 50, isDefault: true }],
      },
    ],
  },
  {
    id: 'p-frock',
    name: ['কিডস ফ্রক', 'Kids frock'],
    kind: 'ordinary',
    taxed: true,
    variants: [
      { id: 'v-frock-2', label: sized('2–3'), price: 650, available: 0 },
      { id: 'v-frock-4', label: sized('4–5'), price: 650, available: 0 },
      { id: 'v-frock-6', label: sized('6–7'), price: 650, available: 0 },
    ],
  },
  {
    id: 'p-burger',
    name: ['বিফ বার্গার', 'Beef burger'],
    kind: 'ordinary',
    searchedOnly: true,
    variants: [{ id: 'v-burger', label: ['', ''], price: 250, available: null }],
    groups: [
      {
        id: 'g-spice',
        name: ['ঝাল', 'Spice level'],
        min: 1,
        max: 1,
        options: [
          { id: 'o-mild', name: ['কম', 'Mild'], price: 0, isDefault: false },
          { id: 'o-medium', name: ['মাঝারি', 'Medium'], price: 0, isDefault: true },
          { id: 'o-hot', name: ['বেশি', 'Hot'], price: 0, isDefault: false },
        ],
      },
      {
        id: 'g-extras',
        name: ['এক্সট্রা', 'Extras'],
        min: 0,
        max: 3,
        options: [
          { id: 'o-cheese', name: ['এক্সট্রা চিজ', 'Extra cheese'], price: 30, isDefault: true },
          { id: 'o-bacon', name: ['বেকন', 'Bacon'], price: 40, isDefault: false },
        ],
      },
    ],
  },
];

/** The phone Part 29's `o29-new-known` draws: Nusrat, four orders, the last to Mirpur. */
export const KNOWN_PHONE = '01711234567';
const KNOWN = {
  id: 'c-nusrat',
  name: ['নুসরাত জাহান', 'Nusrat Jahan'] as Words,
  orderCount: 4,
  lastAddress: { locationId: 102, deliveryAddress: 'House 5, Road 10, Mirpur 11' },
};

const say = (words: Words, language: Language): string => (language === 'bn' ? words[0] : words[1]);
const money = (amount: number) => amount.toFixed(2);
const units = (available: number | null) => (available === null ? null : available.toFixed(3));

/** A variant anywhere in the catalogue, with its product. */
function variantOf(id: string): { product: PickerProduct; variant: PickerVariant } | null {
  for (const product of PICKER) {
    const variant = product.variants.find((each) => each.id === id);
    if (variant) return { product, variant };
  }
  return null;
}

/** A thana's district, for the zone it falls in. */
function placeOf(locationId: number) {
  for (const zilla of LOCATIONS.zillas) {
    const thana = zilla.thanas.find((each) => each.id === locationId);
    if (thana) return { zilla, thana };
  }
  return null;
}

/** Dhaka district is inside Dhaka at ৳70; Bandarban a zone the shop doesn't deliver to; elsewhere ৳120. */
function zoneOf(locationId: number | null) {
  const place = locationId === null ? null : placeOf(locationId);
  if (!place) return null;
  if (place.zilla.id === 1) {
    return { id: 'z-in', name: { en: 'Inside Dhaka', bn: 'ঢাকার ভেতরে' }, charge: 70, off: false };
  }
  if (place.zilla.id === 4) {
    return {
      id: 'z-hills',
      name: { en: 'Hill districts', bn: 'পাহাড়ি জেলা' },
      charge: 0,
      off: true,
    };
  }
  return { id: 'z-out', name: { en: 'Outside Dhaka', bn: 'ঢাকার বাইরে' }, charge: 120, off: false };
}

interface SentItem {
  variantId: string;
  quantity: number;
  unitPrice?: number;
  lineId?: string;
  choices?: { part: number; variantIds: string[] }[];
  modifiers?: { groupId: string; optionIds: string[] }[];
}

/** An item priced: its price for each with the add-ons chosen, or as set by hand. */
function priced(item: SentItem) {
  const found = variantOf(item.variantId);
  const groups = found?.product.groups ?? [];
  const chosen = groups.flatMap((group) => {
    const ids =
      item.modifiers?.find((each) => each.groupId === group.id)?.optionIds ??
      group.options.filter((option) => option.isDefault).map((option) => option.id);
    return group.options.filter((option) => ids.includes(option.id));
  });
  const each =
    item.unitPrice ??
    (found?.variant.price ?? 0) + chosen.reduce((sum, option) => sum + option.price, 0);
  return { found, chosen, each, total: each * item.quantity };
}

/** POST /orders/quote: the subtotal, the zone's charge or the one by hand, the discount, the VAT inside. */
function quoteOf(body: Record<string, unknown>) {
  const items = (body.items ?? []) as SentItem[];
  const lines = items.map(priced);
  const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
  const delivery = body.fulfilmentType === undefined || body.fulfilmentType === 'delivery';
  const zone = delivery
    ? zoneOf(typeof body.locationId === 'number' ? body.locationId : null)
    : null;
  const charge = !delivery
    ? 0
    : typeof body.deliveryCharge === 'number'
      ? body.deliveryCharge
      : (zone?.charge ?? 0);
  const discount = typeof body.discount === 'number' ? body.discount : 0;
  const total = subtotal + charge - discount;
  const taxed = lines
    .filter((line) => line.found?.product.taxed)
    .reduce((sum, line) => sum + line.total, 0);
  return {
    items: items.map((item, index) => ({
      variantId: item.variantId,
      productName: lines[index]?.found ? say(lines[index].found.product.name, 'en') : '',
      listPrice: money(lines[index]?.found?.variant.price ?? 0),
      unitPrice: money(lines[index]?.each ?? 0),
      quantity: item.quantity.toFixed(3),
      modifiers: [],
      itemTotal: money(lines[index]?.total ?? 0),
      deliveryCharge: '0.00',
      advance: '0.00',
    })),
    deliveryZone: zone ? { id: zone.id, name: zone.name, charge: money(zone.charge) } : null,
    subtotal: money(subtotal),
    deliveryCharge: money(charge),
    discount: money(discount),
    grandTotal: money(total),
    advanceDue: '0.00',
    codAmount: money(total),
    taxes:
      taxed > 0
        ? [{ name: 'VAT', rate: '5.00', amount: money(Math.round((taxed * 5 * 100) / 105) / 100) }]
        : [],
    warnings: zone?.off ? [{ code: 'zone_no_delivery', zone: zone.name, productName: null }] : [],
  };
}

function pickerItem(product: PickerProduct, language: Language) {
  const prices = product.variants.map((variant) => variant.price);
  const sold = product.variants.map((variant) => variant.available);
  return {
    id: product.id,
    name: say(product.name, language),
    kind: product.kind,
    minPrice: money(Math.min(...prices)),
    maxPrice: money(Math.max(...prices)),
    active: true,
    image: null,
    variantCount: product.variants.length,
    available: sold.includes(null)
      ? null
      : units(sold.reduce<number>((sum, each) => sum + (each ?? 0), 0)),
  };
}

function pickerProduct(product: PickerProduct, language: Language) {
  return {
    id: product.id,
    name: say(product.name, language),
    kind: product.kind,
    active: true,
    variants: product.variants.map((variant) => ({
      variantId: variant.id,
      label: say(variant.label, language),
      price: money(variant.price),
      available: units(variant.available),
    })),
    parts: (product.parts ?? []).map((part) => ({
      position: part.position,
      quantity: '1.000',
      variants: part.variants.map((variant) => ({
        variantId: variant.id,
        productName: say(part.product, language),
        label: say(variant.label, language),
        onSale: true,
        available: units(variant.available),
      })),
    })),
    modifierGroups: (product.groups ?? []).map((group) => ({
      id: group.id,
      name: say(group.name, language),
      minSelect: group.min,
      maxSelect: group.max,
      options: group.options.map((option) => ({
        id: option.id,
        name: say(option.name, language),
        priceChange: money(option.price),
        isDefault: option.isDefault,
      })),
    })),
  };
}

type Answer =
  | { data: unknown }
  | {
      refused: {
        status: number;
        code: string;
        message: string;
        details?: Record<string, unknown>;
      };
    };

/** Add an item's reads, the quote and the known phone; undefined for any other request. */
export function pickerAnswer(
  method: string,
  path: string,
  url: URL,
  body: Record<string, unknown> | null,
  language: Language,
): Answer | undefined {
  if (method === 'GET' && path === '/orders/picker') {
    const search = (url.searchParams.get('search') ?? '').toLowerCase();
    const found = PICKER.filter((product) =>
      search === ''
        ? !product.searchedOnly
        : product.name.some((name) => name.toLowerCase().includes(search)),
    );
    return {
      data: {
        products: found.map((product) => pickerItem(product, language)),
        page: 1,
        pages: 1,
        total: found.length,
      },
    };
  }
  const one = /^\/orders\/picker\/([^/]+)$/.exec(path);
  if (method === 'GET' && one) {
    const product = PICKER.find((each) => each.id === one[1]);
    return product
      ? { data: pickerProduct(product, language) }
      : { refused: { status: 404, code: 'not_found', message: 'Not found' } };
  }
  if (method === 'POST' && path === '/orders/quote') return { data: quoteOf(body ?? {}) };
  if (method === 'GET' && path === '/customers') {
    const q = url.searchParams.get('q') ?? '';
    const customers =
      q === KNOWN_PHONE
        ? [
            {
              id: KNOWN.id,
              name: say(KNOWN.name, language),
              phone: KNOWN_PHONE,
              orderCount: KNOWN.orderCount,
              totalSpent: '9800.00',
              lastOrderAt: null,
              firstOrderAt: '2026-08-02T10:00:00.000Z',
              hasAccount: false,
            },
          ]
        : [];
    return { data: { customers, page: 1, limit: 20, total: customers.length, pages: 1 } };
  }
  if (method === 'GET' && path === `/customers/${KNOWN.id}`) {
    return {
      data: {
        id: KNOWN.id,
        name: say(KNOWN.name, language),
        phone: KNOWN_PHONE,
        orderCount: KNOWN.orderCount,
        totalSpent: '9800.00',
        lastOrderAt: null,
        firstOrderAt: '2026-08-02T10:00:00.000Z',
        hasAccount: false,
        lastAddress: KNOWN.lastAddress,
        account: null,
      },
    };
  }
  return undefined;
}

/** An item as an order keeps it: its product, variant, price for each, a combo's items and its add-on. */
function itemOf(item: SentItem): OrderItemFixture | null {
  const line = priced(item);
  if (!line.found) return null;
  const { product, variant } = line.found;
  const choices = item.choices ?? [];
  const inside = (product.parts ?? []).map((part): Words => {
    const id = choices.find((each) => each.part === part.position)?.variantIds[0];
    const picked = part.variants.find((each) => each.id === id) ?? part.variants[0];
    return picked && picked.label[1] !== ''
      ? [`${part.product[0]} · ${picked.label[0]}`, `${part.product[1]} · ${picked.label[1]}`]
      : part.product;
  });
  const addOn = line.chosen.find((option) => option.price > 0);
  return {
    name: product.name,
    variant: variant.label[1] === '' ? null : variant.label,
    quantity: item.quantity,
    unitPrice: line.each,
    ...(product.kind === 'combo' ? { inside } : {}),
    addOn: addOn ? { name: addOn.name, price: addOn.price } : null,
  };
}

const problem = (field: string, message: string) => ({ field, problem: 'required', message });

/**
 * POST /orders: the order made from what was typed, or refused as the server would -- each missing field named, an
 * item asking more than is left naming its variant (NotEnoughStockForOrder).
 */
export function madeOrder(
  body: Record<string, unknown>,
  orders: OrderFixture[],
): { made: OrderFixture } | Answer {
  const type = (body.fulfilmentType as OrderFixture['fulfilment'] | undefined) ?? 'delivery';
  const fields = [
    ...(type !== 'dine_in' && typeof body.customerName !== 'string'
      ? [problem('customerName', 'Required.')]
      : []),
    ...(type !== 'dine_in' && typeof body.phone !== 'string'
      ? [problem('phone', 'Required.')]
      : []),
    ...(type === 'delivery' && typeof body.locationId !== 'number'
      ? [problem('locationId', 'Required.')]
      : []),
    ...(type === 'delivery' && typeof body.deliveryAddress !== 'string'
      ? [problem('deliveryAddress', 'Required.')]
      : []),
    ...(type === 'dine_in' && typeof body.tableRef !== 'string'
      ? [problem('tableRef', 'Required.')]
      : []),
  ];
  if (fields.length > 0) {
    return {
      refused: {
        status: 400,
        code: 'validation_error',
        message: 'Some fields need fixing.',
        details: { fields },
      },
    };
  }
  const items = (body.items ?? []) as SentItem[];
  for (const item of items) {
    const found = variantOf(item.variantId);
    if (found && found.variant.available !== null && item.quantity > found.variant.available) {
      return {
        refused: {
          status: 409,
          code: 'conflict',
          message: `There is not enough "${found.product.name[1]}" in stock for this order.`,
          details: { productId: found.product.id, variantId: found.variant.id },
        },
      };
    }
  }
  const next =
    48 + orders.filter((each) => each.source === 'dashboard' && each.id.startsWith('o-new')).length;
  const quote = quoteOf(body);
  const place = typeof body.locationId === 'number' ? placeOf(body.locationId) : null;
  const name = typeof body.customerName === 'string' ? body.customerName : '';
  const payment = body.payment as
    { method: string; amount: number; senderNumber?: string; transactionId?: string } | undefined;
  return {
    made: {
      id: `o-new-${String(next)}`,
      number: `261031-00${String(next)}`,
      status: body.status === 'confirmed' ? 'confirmed' : 'pending',
      source: 'dashboard',
      fulfilment: type,
      table: typeof body.tableRef === 'string' ? body.tableRef : null,
      name: [name, name],
      phone: typeof body.phone === 'string' ? body.phone : '',
      area: place
        ? {
            thana: [place.thana.nameBn, place.thana.nameEn],
            zilla: [place.zilla.nameBn, place.zilla.nameEn],
            thanaId: place.thana.id,
            zillaId: place.zilla.id,
          }
        : null,
      address:
        typeof body.deliveryAddress === 'string'
          ? [body.deliveryAddress, body.deliveryAddress]
          : null,
      createdAt: new Date().toISOString(),
      items: items.flatMap((item) => itemOf(item) ?? []),
      deliveryCharge: Number(quote.deliveryCharge),
      discount: Number(quote.discount),
      notes: typeof body.notes === 'string' ? body.notes : null,
      calls: [],
      customerOrders: 1,
      payments: payment
        ? [
            {
              method: payment.method,
              amount: payment.amount,
              ...(payment.senderNumber ? { sender: payment.senderNumber } : {}),
              ...(payment.transactionId ? { trxId: payment.transactionId } : {}),
              at: new Date().toISOString(),
            },
          ]
        : [],
    },
  };
}

/** PATCH /orders/:id (ORD-11): its details as sent, each kept line's quantity, and new lines added. */
export function editedOrder(order: OrderFixture, body: Record<string, unknown>): void {
  if (typeof body.customerName === 'string') order.name = [body.customerName, body.customerName];
  if (typeof body.phone === 'string') order.phone = body.phone;
  if (typeof body.deliveryAddress === 'string') {
    order.address = [body.deliveryAddress, body.deliveryAddress];
  }
  if (typeof body.notes === 'string' || body.notes === null) order.notes = body.notes;
  if (typeof body.discount === 'number') order.discount = body.discount;
  if (!Array.isArray(body.items)) return;
  const sent = body.items as SentItem[];
  order.items = sent.flatMap((item) => {
    if (item.lineId === undefined) return itemOf(item) ?? [];
    const kept = order.items[Number(item.lineId.split('-line-')[1])];
    return kept
      ? [{ ...kept, quantity: item.quantity, unitPrice: item.unitPrice ?? kept.unitPrice }]
      : [];
  });
}
