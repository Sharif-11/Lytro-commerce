import type { Language } from './mock-api';

// Orders against a mocked API (Slice 4.8a; ORD-01 to ORD-52): the day's orders at Megh Fashion as Part 29 draws them,
// each in its state, and the writes the order page sends -- a call logged, a hold set or released, a cancel, a delete,
// delivered and handed over -- so the reads after them show what changed.

const DAY_MS = 24 * 60 * 60 * 1000;

type Words = [string, string];

export interface OrderCallFixture {
  outcome: 'confirmed' | 'no_answer' | 'call_back_later' | 'cancelled';
  at: string;
  note?: Words | null;
  callBackAt?: string | null;
}

export interface OrderItemFixture {
  name: Words;
  variant?: Words | null;
  quantity: number;
  unitPrice: number;
  /** A combo's items inside it, as ordered. */
  inside?: Words[];
  addOn?: { name: Words; price: number } | null;
  /** Units back (ORD-10). */
  returned?: number;
  /** One unit's weight in kg, for the label. */
  weightKg?: number;
  /** A serial-numbered item's serials (INV-14): held to send, and sent. */
  serials?: { inStock: string[]; sent: string[] };
}

export interface OrderFixture {
  id: string;
  number: string;
  status: 'pending' | 'confirmed' | 'hold' | 'shipped' | 'delivered' | 'returned' | 'cancelled';
  source: 'storefront' | 'landing_page' | 'dashboard' | 'api';
  fulfilment: 'delivery' | 'takeaway' | 'dine_in';
  table?: string | null;
  name: Words;
  phone: string;
  /** Thana and district; null at the counter. */
  area: { thana: Words; zilla: Words; thanaId: number; zillaId: number } | null;
  address?: Words | null;
  shopperNote?: Words | null;
  createdAt: string;
  items: OrderItemFixture[];
  deliveryCharge: number;
  calls: OrderCallFixture[];
  holdUntil?: string | null;
  cancelReason?: string | null;
  cancelNote?: string | null;
  customerOrders?: number | null;
  courier?: { name: string; code: string; at: string } | null;
  /** The cash collected when it was delivered or handed over. */
  collected?: number;
  /** Paid before it went: an advance (ORD-22). */
  payments?: {
    method: string;
    amount: number;
    sender?: string;
    trxId?: string;
    at: string;
    /** Voided by mistake, with why (agreed 2026-10-30). */
    voided?: string | null;
  }[];
  /** The month's limit the next ship passes (QTA-03), said in its reply. */
  limitOnShip?: number | null;
  /** Said once, in the reply of the ship that passed it. */
  limitShown?: boolean;
}

export interface OrdersFixture {
  orders: OrderFixture[];
}

/** A time today on Dhaka's clock (UTC+6), `days` before today. */
export function dhaka(hour: number, minute: number, daysAgo = 0): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
  const [year, month, day] = today.split('-').map(Number);
  return new Date(
    Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) - daysAgo, hour - 6, minute),
  ).toISOString();
}

/** Handed over at the counter: no thana. */
const COUNTER: OrderFixture['area'] = null;
const area = (thana: Words, zilla: Words, thanaId: number, zillaId: number) => ({
  thana,
  zilla,
  thanaId,
  zillaId,
});
const MIRPUR = area(['মিরপুর', 'Mirpur'], ['ঢাকা', 'Dhaka'], 101, 1);

/** The order Part 29 draws open: a T-shirt pair and an Eid combo with gift wrap, to Mirpur. */
const NUSRAT_ITEMS: OrderItemFixture[] = [
  {
    name: ['কটন টি-শার্ট', 'Cotton T-shirt'],
    variant: ['L · কালো', 'L · Black'],
    quantity: 2,
    unitPrice: 450,
  },
  {
    name: ['ঈদ কম্বো', 'Eid combo'],
    quantity: 1,
    unitPrice: 2500,
    inside: [
      ['কটন পাঞ্জাবি · M', 'Cotton panjabi · M'],
      ['চেক লুঙ্গি', 'Check lungi'],
    ],
    addOn: { name: ['গিফট র‍্যাপ', 'Gift wrap'], price: 50 },
  },
];

const one = (name: Words, price: number, quantity = 1): OrderItemFixture[] => [
  { name, quantity, unitPrice: price },
];

/** The day's orders at Megh Fashion (Part 29's `O29`), newest first. */
export function meghOrders(): OrdersFixture {
  return {
    orders: [
      {
        id: 'o-47',
        number: '261031-0047',
        status: 'pending',
        source: 'storefront',
        fulfilment: 'delivery',
        name: ['নুসরাত জাহান', 'Nusrat Jahan'],
        phone: '+8801711234567',
        area: MIRPUR,
        address: ['বাসা 5, রোড 10, মিরপুর 11', 'House 5, Road 10, Mirpur 11'],
        shopperNote: ['দুপুর 2টার পর কল দিবেন', 'Please call after 2 pm'],
        createdAt: dhaka(11, 42),
        items: NUSRAT_ITEMS,
        deliveryCharge: 70,
        calls: [],
        customerOrders: 4,
      },
      {
        id: 'o-46',
        number: '261031-0046',
        status: 'pending',
        source: 'storefront',
        fulfilment: 'delivery',
        name: ['রাকিব হাসান', 'Rakib Hasan'],
        phone: '+8801819876543',
        area: area(['উত্তরা', 'Uttara'], ['ঢাকা', 'Dhaka'], 102, 1),
        address: ['বাসা 12, সেক্টর 7', 'House 12, Sector 7'],
        createdAt: dhaka(10, 15),
        items: one(['ডেনিম জ্যাকেট', 'Denim jacket'], 2120),
        deliveryCharge: 70,
        calls: [
          { outcome: 'no_answer', at: dhaka(10, 30) },
          { outcome: 'no_answer', at: dhaka(10, 58) },
        ],
        customerOrders: 1,
      },
      {
        id: 'o-45',
        number: '261031-0045',
        status: 'pending',
        source: 'dashboard',
        fulfilment: 'takeaway',
        name: ['করিম উদ্দিন', 'Karim Uddin'],
        phone: '+8801755111222',
        area: COUNTER,
        createdAt: dhaka(10, 2),
        items: one(['কিডস ফ্রক', 'Kids frock'], 650),
        deliveryCharge: 0,
        calls: [],
        customerOrders: 2,
      },
      {
        id: 'o-44',
        number: '261031-0044',
        status: 'confirmed',
        source: 'landing_page',
        fulfilment: 'delivery',
        name: ['সুমাইয়া আক্তার', 'Sumaiya Akter'],
        phone: '+8801922333444',
        area: area(['পাঁচলাইশ', 'Panchlaish'], ['চট্টগ্রাম', 'Chattogram'], 201, 2),
        address: ['বাসা 3, রোড 2', 'House 3, Road 2'],
        createdAt: dhaka(9, 30),
        items: [
          {
            name: ['কটন টি-শার্ট', 'Cotton T-shirt'],
            variant: ['M · সাদা', 'M · White'],
            quantity: 2,
            unitPrice: 450,
          },
          {
            name: ['ডেনিম জ্যাকেট', 'Denim jacket'],
            variant: ['L', 'L'],
            quantity: 1,
            unitPrice: 2750,
          },
        ],
        deliveryCharge: 130,
        calls: [{ outcome: 'confirmed', at: dhaka(12, 10) }],
        customerOrders: 3,
      },
      {
        id: 'o-43',
        number: '261031-0043',
        status: 'hold',
        source: 'storefront',
        fulfilment: 'delivery',
        name: ['তানভীর আহমেদ', 'Tanvir Ahmed'],
        phone: '+8801533444555',
        area: area(['ধানমন্ডি', 'Dhanmondi'], ['ঢাকা', 'Dhaka'], 103, 1),
        address: ['বাসা 7, রোড 4', 'House 7, Road 4'],
        createdAt: dhaka(9, 5),
        items: one(['চেক লুঙ্গি', 'Check lungi'], 920),
        deliveryCharge: 70,
        holdUntil: dhaka(16, 0),
        calls: [
          {
            outcome: 'call_back_later',
            at: dhaka(12, 2),
            callBackAt: dhaka(16, 0),
            note: [
              'অফিসে আছেন, বিকেলে কল দিতে বললেন',
              'At the office, asked for a call in the afternoon',
            ],
          },
        ],
        customerOrders: 1,
      },
      {
        id: 'o-39',
        number: '261030-0039',
        status: 'shipped',
        source: 'storefront',
        fulfilment: 'delivery',
        name: ['ফারহানা ইসলাম', 'Farhana Islam'],
        phone: '+8801344555666',
        area: area(['সাভার', 'Savar'], ['ঢাকা', 'Dhaka'], 104, 1),
        address: ['বাসা 9, ব্যাংক টাউন', 'House 9, Bank Town'],
        createdAt: dhaka(15, 20, 1),
        items: one(['কটন পাঞ্জাবি', 'Cotton panjabi'], 790, 2),
        deliveryCharge: 70,
        calls: [{ outcome: 'confirmed', at: dhaka(16, 0, 1) }],
        courier: { name: 'Steadfast', code: 'SF-2610-4471', at: dhaka(18, 12, 1) },
        customerOrders: 2,
      },
      {
        id: 'o-38',
        number: '261030-0038',
        status: 'delivered',
        source: 'storefront',
        fulfilment: 'delivery',
        name: ['মাহমুদ হাসান', 'Mahmud Hasan'],
        phone: '+8801866777888',
        area: area(['সোনাডাঙ্গা', 'Sonadanga'], ['খুলনা', 'Khulna'], 301, 3),
        address: ['বাসা 1, রোড 1', 'House 1, Road 1'],
        createdAt: dhaka(11, 0, 1),
        items: one(['ডেনিম জ্যাকেট', 'Denim jacket'], 1070),
        deliveryCharge: 130,
        calls: [{ outcome: 'confirmed', at: dhaka(11, 30, 1) }],
        courier: { name: 'Pathao', code: 'PTH-88213', at: dhaka(14, 0, 1) },
        collected: 1200,
        customerOrders: 1,
      },
      {
        id: 'o-31',
        number: '261029-0031',
        status: 'cancelled',
        source: 'storefront',
        fulfilment: 'delivery',
        name: ['জেরিন তাসনিম', 'Zerin Tasnim'],
        phone: '+8801677888999',
        area: MIRPUR,
        address: ['বাসা 2, রোড 6', 'House 2, Road 6'],
        createdAt: dhaka(12, 0, 2),
        items: one(['কিডস ফ্রক', 'Kids frock'], 710),
        deliveryCharge: 70,
        calls: [{ outcome: 'cancelled', at: dhaka(12, 5, 2) }],
        cancelReason: 'fake_order',
        customerOrders: 1,
      },
      {
        id: 'o-30',
        number: '261029-0030',
        status: 'returned',
        source: 'storefront',
        fulfilment: 'delivery',
        name: ['ইমরান হোসেন', 'Imran Hossain'],
        phone: '+8801788999000',
        area: area(['বাড্ডা', 'Badda'], ['ঢাকা', 'Dhaka'], 105, 1),
        address: ['বাসা 4, রোড 8', 'House 4, Road 8'],
        createdAt: dhaka(10, 0, 2),
        items: one(['ডেনিম জ্যাকেট', 'Denim jacket'], 1820),
        deliveryCharge: 70,
        calls: [{ outcome: 'confirmed', at: dhaka(10, 30, 2) }],
        courier: { name: 'Steadfast', code: 'SF-2610-4402', at: dhaka(15, 0, 2) },
        customerOrders: 1,
      },
    ],
  };
}

const say = (words: Words | null | undefined, language: Language): string | null =>
  words ? (language === 'bn' ? words[0] : words[1]) : null;

const RUMANA = (language: Language) => ({
  id: 'u-owner',
  name: language === 'bn' ? 'রুমানা' : 'Rumana',
});

const subtotalOf = (order: OrderFixture) =>
  order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
const totalOf = (order: OrderFixture) => subtotalOf(order) + order.deliveryCharge;
const taxedOf = (order: OrderFixture) =>
  order.items
    .filter((item) => !item.inside)
    .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
const paidOf = (order: OrderFixture) =>
  (order.collected ?? 0) +
  (order.payments ?? []).reduce((sum, each) => sum + (each.voided ? 0 : each.amount), 0);
const money = (amount: number) => amount.toFixed(2);
const counter = (order: OrderFixture) => order.fulfilment !== 'delivery';

function attributes(words: Words | null | undefined, language: Language) {
  const said = say(words, language);
  return said
    ? said.split(' · ').map((value) => ({
        name: '',
        value,
        dataType: 'text',
        unitKind: null,
        variantDefining: true,
      }))
    : [];
}

function summary(order: OrderFixture, language: Language) {
  return {
    id: order.id,
    orderNumber: order.number,
    status: order.status,
    paymentStatus: paidOf(order) >= totalOf(order) ? 'paid' : 'unverified',
    fulfillmentStatus: fulfilmentOf(order),
    source: order.source,
    fulfilmentType: order.fulfilment,
    customerName: say(order.name, language),
    customerPhone: order.phone,
    customerErased: false,
    tableRef: order.table ?? null,
    // How many lines, as the server counts them.
    items: order.items.length,
    grandTotal: money(totalOf(order)),
    codAmount: money(totalOf(order) - paidOf(order)),
    cancelReason: order.cancelReason ?? null,
    holdUntil: order.status === 'hold' ? (order.holdUntil ?? null) : null,
    createdAt: order.createdAt,
    area: order.area
      ? {
          thana: {
            id: order.area.thanaId,
            nameBn: order.area.thana[0],
            nameEn: order.area.thana[1],
          },
          zilla: {
            id: order.area.zillaId,
            nameBn: order.area.zilla[0],
            nameEn: order.area.zilla[1],
          },
        }
      : null,
    unansweredCalls: order.calls.filter((call) => call.outcome === 'no_answer').length,
  };
}

function fulfilmentOf(order: OrderFixture): string {
  if (order.status === 'returned') return 'returned';
  if (order.status === 'delivered') return 'delivered';
  if (order.status === 'shipped') return 'shipped';
  return 'unfulfilled';
}

function detail(order: OrderFixture, language: Language) {
  const total = totalOf(order);
  const paid = paidOf(order);
  const by = RUMANA(language);
  const history: Record<string, unknown>[] = [
    {
      field: 'created',
      from: null,
      to: 'pending',
      note: null,
      by: order.source === 'dashboard' ? by : null,
      at: order.createdAt,
    },
  ];
  for (const call of order.calls) {
    if (call.outcome === 'confirmed') {
      history.push({
        field: 'confirmed',
        from: null,
        to: 'confirmed',
        note: null,
        by,
        at: call.at,
      });
    }
    if (call.outcome === 'cancelled') {
      history.push({
        field: 'status_override',
        from: null,
        to: 'cancelled',
        note: order.cancelReason,
        by,
        at: call.at,
      });
    }
  }
  if (order.courier) {
    history.push({
      field: 'fulfillment_status',
      from: 'unfulfilled',
      to: 'shipped',
      note: null,
      by,
      at: order.courier.at,
    });
  }
  if (order.status === 'delivered' || order.status === 'returned') {
    history.push({
      field: 'fulfillment_status',
      from: counter(order) ? 'unfulfilled' : 'shipped',
      to: 'delivered',
      note: null,
      by,
      at: order.courier
        ? new Date(new Date(order.courier.at).getTime() + DAY_MS / 2).toISOString()
        : order.createdAt,
    });
  }
  const payments = [
    ...(order.payments ?? []).map((each, index) => ({
      id: `${order.id}-pay-${String(index)}`,
      method: each.method,
      amount: money(each.amount),
      senderNumber: each.sender ?? null,
      transactionId: each.trxId ?? null,
      verifiedBy: by,
      verifiedAt: each.at,
      voided: each.voided ? { by, at: each.at, reason: each.voided } : null,
    })),
    ...(order.collected
      ? [
          {
            id: `${order.id}-cod`,
            method: counter(order) ? 'cash' : 'cash_on_delivery',
            amount: money(order.collected),
            senderNumber: null,
            transactionId: null,
            verifiedBy: by,
            verifiedAt: dhaka(17, 10),
            voided: null,
          },
        ]
      : []),
  ];
  return {
    ...summary(order, language),
    trackingId: `trk-${order.id}`,
    override: order.status === 'hold' ? 'hold' : order.status === 'cancelled' ? 'cancelled' : null,
    confirmedAt: order.calls.find((call) => call.outcome === 'confirmed')?.at ?? null,
    confirmedBy: null,
    customerId: `c-${order.id}`,
    customerOrders: order.customerOrders ?? null,
    location: order.area
      ? {
          id: order.area.thanaId,
          nameBn: order.area.thana[0],
          nameEn: order.area.thana[1],
          zillaId: order.area.zillaId,
        }
      : null,
    deliveryAddress: say(order.address, language),
    deliveryZone: counter(order)
      ? null
      : {
          id: 'z-in',
          name:
            order.deliveryCharge === 70
              ? { en: 'Inside Dhaka', bn: 'ঢাকার ভেতরে' }
              : { en: 'Outside Dhaka', bn: 'ঢাকার বাইরে' },
          charge: money(order.deliveryCharge),
        },
    extraChargePerKg: '0.00',
    cancelNote: order.cancelNote ?? order.cancelReason ?? null,
    cancelledAt: order.status === 'cancelled' ? (order.calls.at(-1)?.at ?? order.createdAt) : null,
    subtotal: money(subtotalOf(order)),
    deliveryCharge: money(order.deliveryCharge),
    deliveryChargeByHand: false,
    discount: '0.00',
    advanceDue: '0.00',
    due: money(Math.max(0, total - paid)),
    // Clothing at 5% VAT, inside the price (TAX-03); a combo is not taxed (Part 29's ৳42.86 on the T-shirts' ৳900).
    taxes: [
      {
        name: 'VAT',
        rate: '5.00',
        amount: money(Math.round((taxedOf(order) * 5 * 100) / 105) / 100),
      },
    ],
    courierName: order.courier?.name ?? null,
    trackingCode: order.courier?.code ?? null,
    trackingLink: null,
    shippedAt: order.courier?.at ?? null,
    deliveredAt: order.status === 'delivered' ? dhaka(17, 10) : null,
    handledAt: order.courier?.at ?? null,
    notes: null,
    shopperNote: say(order.shopperNote, language),
    createdBy: order.source === 'dashboard' ? by : null,
    updatedAt: order.createdAt,
    items: order.items.map((item, index) => ({
      id: `${order.id}-line-${String(index)}`,
      productId: `p-${String(index)}`,
      variantId: `v-${String(index)}`,
      productName: say(item.name, language) ?? '',
      sku: null,
      attributes: attributes(item.variant, language),
      captured: [],
      thumbnail: null,
      stockUnit: 'piece',
      listPrice: money(item.unitPrice),
      unitPrice: money(item.unitPrice),
      quantity: `${String(item.quantity)}.000`,
      packAmount: null,
      itemDiscount: '0.00',
      itemTotal: money(item.quantity * item.unitPrice),
      returnedQuantity: `${String(item.returned ?? 0)}.000`,
      weightKg: item.weightKg === undefined ? null : item.weightKg.toFixed(3),
      ownDeliveryCharge: null,
      deliveryMode: 'zone',
      deliveryCharge: '0.00',
      paymentPolicy: 'cod',
      advance: '0.00',
      modifiers: item.addOn
        ? [
            {
              groupId: 'g-wrap',
              groupName: '',
              optionId: 'opt-wrap',
              optionName: say(item.addOn.name, language) ?? '',
              priceChange: money(item.addOn.price),
            },
          ]
        : [],
      taxClassName: 'VAT',
      taxRate: '5.00',
      taxAmount: '0.00',
      components: (item.inside ?? []).map((part, position) => ({
        partPosition: position + 1,
        productId: null,
        // Each item inside by its own variant, as a damaged one is named on a return (CMB-05).
        variantId: `cv-${String(index)}-${String(position + 1)}`,
        productName: say(part, language) ?? '',
        attributes: [],
        quantity: '1.000',
      })),
    })),
    calls: order.calls.map((call, index) => ({
      id: `${order.id}-call-${String(index)}`,
      outcome: call.outcome,
      callBackAt: call.callBackAt ?? null,
      note: say(call.note, language),
      by,
      at: call.at,
    })),
    history,
    payments,
    warnings: [],
    limitPrompt:
      order.limitShown && order.limitOnShip
        ? { metric: 'orders_monthly', limit: order.limitOnShip }
        : null,
  };
}

/** Home's orders block (Slice 4.8b): the jobs and today's figures, as GET /home counts them. */
export function homeOrders(fixture: OrdersFixture): Record<string, unknown> {
  const dayOf = (iso: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date(iso));
  const today = dayOf(new Date().toISOString());
  const yesterday = dayOf(new Date(Date.now() - DAY_MS).toISOString());
  const count = (test: (order: OrderFixture) => boolean) => fixture.orders.filter(test).length;
  return {
    toConfirm: count((order) => order.status === 'pending'),
    callsDue: count(
      (order) => order.status === 'hold' && (order.holdUntil ?? '') <= new Date().toISOString(),
    ),
    toShip: count((order) => order.status === 'confirmed' && order.fulfilment === 'delivery'),
    today: count((order) => dayOf(order.createdAt) === today),
    yesterday: count((order) => dayOf(order.createdAt) === yesterday),
    monthSales: '0.00',
  };
}

/** What each tab's visible status reads as (ORD-41). */
function shown(order: OrderFixture, status: string | null): boolean {
  return status === null || order.status === status;
}

function matches(order: OrderFixture, q: string | null): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    order.number.includes(needle) ||
    order.phone.endsWith(needle) ||
    order.name.some((each) => each.toLowerCase().includes(needle))
  );
}

/** The answer to an orders request, or undefined when it is not one. */
export function ordersAnswer(
  method: string,
  path: string,
  url: URL,
  body: Record<string, unknown> | null,
  fixture: OrdersFixture,
  language: Language,
): { data: unknown } | { refused: { status: number; code: string; message: string } } | undefined {
  if (method === 'GET' && path === '/orders') {
    const status = url.searchParams.get('status');
    const q = url.searchParams.get('q');
    const reason = url.searchParams.get('cancelReason');
    const from = url.searchParams.get('dateFrom');
    const to = url.searchParams.get('dateTo');
    const limit = Number(url.searchParams.get('limit') ?? '20');
    const dayOf = (iso: string) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date(iso));
    const found = fixture.orders
      .filter((order) => shown(order, status) && matches(order, q))
      .filter((order) => reason === null || order.cancelReason === reason)
      .filter((order) => from === null || dayOf(order.createdAt) >= from)
      .filter((order) => to === null || dayOf(order.createdAt) <= to)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      data: {
        orders: found.slice(0, limit).map((order) => summary(order, language)),
        page: 1,
        limit,
        total: found.length,
        pages: Math.max(1, Math.ceil(found.length / limit)),
      },
    };
  }
  if (method === 'GET' && path === '/orders/couriers') {
    const shipped = fixture.orders
      .flatMap((order) => (order.courier ? [order.courier] : []))
      .sort((a, b) => b.at.localeCompare(a.at));
    return { data: { couriers: [...new Set(shipped.map((each) => each.name))] } };
  }
  const voiding = /^\/orders\/([^/]+)\/payments\/([^/]+)\/void$/.exec(path);
  if (method === 'POST' && voiding) {
    const order = fixture.orders.find((each) => each.id === voiding[1]);
    const index = Number((voiding[2] ?? '').split('-pay-')[1]);
    const payment = order?.payments?.[index];
    if (!order || !payment)
      return { refused: { status: 404, code: 'not_found', message: 'Not found' } };
    payment.voided = String(body?.reason);
    return { data: detail(order, language) };
  }
  const one = /^\/orders\/([^/]+)(?:\/([a-z-]+))?$/.exec(path);
  if (!one || one[1] === 'couriers' || one[1] === 'quote') return undefined;
  const order = fixture.orders.find((each) => each.id === one[1]);
  if (!order) {
    return { refused: { status: 404, code: 'not_found', message: 'Not found' } };
  }
  const action = one[2] ?? null;
  const now = new Date().toISOString();
  if (method === 'GET' && action === null) {
    const view = detail(order, language);
    order.limitShown = false;
    return { data: view };
  }
  if (method === 'GET' && action === 'serials') {
    const gone =
      order.status !== 'pending' && order.status !== 'confirmed' && order.status !== 'hold';
    return {
      data: {
        items: order.items.flatMap((item, index) =>
          item.serials
            ? [
                {
                  lineId: `${order.id}-line-${String(index)}`,
                  variantId: `v-${String(index)}`,
                  productName: say(item.name, language) ?? '',
                  quantity: `${String(item.quantity)}.000`,
                  serialFormat: 'imei',
                  inStock: gone ? [] : item.serials.inStock,
                  sent: gone ? item.serials.sent : [],
                },
              ]
            : [],
        ),
      },
    };
  }
  if (method === 'DELETE' && action === null) {
    fixture.orders = fixture.orders.filter((each) => each.id !== order.id);
    return { data: { ok: true } };
  }
  if (method !== 'POST') return undefined;
  if (action === 'calls') {
    const outcome = String(body?.outcome) as OrderCallFixture['outcome'];
    const note = typeof body?.note === 'string' ? body.note : null;
    order.calls.push({
      outcome,
      at: now,
      note: note === null ? null : [note, note],
      callBackAt: typeof body?.callBackAt === 'string' ? body.callBackAt : null,
    });
    if (outcome === 'confirmed') order.status = 'confirmed';
    if (outcome === 'no_answer' && order.status === 'hold') order.status = 'pending';
    if (outcome === 'call_back_later') {
      order.status = 'hold';
      order.holdUntil = String(body?.callBackAt);
    }
    if (outcome === 'cancelled') {
      order.status = 'cancelled';
      order.cancelReason = String(body?.reason);
      order.cancelNote = note;
    }
    return { data: detail(order, language) };
  }
  if (action === 'cancel') {
    order.status = 'cancelled';
    order.cancelReason = String(body?.reason);
    order.cancelNote = typeof body?.note === 'string' ? body.note : null;
    return { data: detail(order, language) };
  }
  if (action === 'override') {
    order.holdUntil = null;
    order.status = order.calls.some((call) => call.outcome === 'confirmed')
      ? 'confirmed'
      : 'pending';
    return { data: detail(order, language) };
  }
  if (action === 'deliver') {
    order.collected = totalOf(order) - paidOf(order);
    order.status = 'delivered';
    return { data: detail(order, language) };
  }
  // Each serial-numbered item's picks, sent with it (INV-14); refused when one is short.
  const sendSerials = (): boolean => {
    const named = (body?.serials ?? []) as { lineId: string; serials: string[] }[];
    for (const [index, item] of order.items.entries()) {
      if (!item.serials) continue;
      const picks = named.find((each) => each.lineId === `${order.id}-line-${String(index)}`);
      if ((picks?.serials.length ?? 0) !== item.quantity) return false;
    }
    for (const [index, item] of order.items.entries()) {
      if (!item.serials) continue;
      const picks =
        named.find((each) => each.lineId === `${order.id}-line-${String(index)}`)?.serials ?? [];
      item.serials = {
        inStock: item.serials.inStock.filter((each) => !picks.includes(each)),
        sent: [...item.serials.sent, ...picks],
      };
    }
    return true;
  };
  const shortOfSerials = {
    refused: { status: 409, code: 'conflict', message: 'Each unit needs its serial.' },
  };
  if (action === 'hand-over') {
    if (!sendSerials()) return shortOfSerials;
    order.collected = totalOf(order) - paidOf(order);
    order.status = 'delivered';
    return { data: detail(order, language) };
  }
  if (action === 'ship') {
    if (!sendSerials()) return shortOfSerials;
    order.courier = {
      name: String(body?.courierName),
      code:
        typeof body?.trackingCode === 'string'
          ? body.trackingCode
          : typeof body?.trackingLink === 'string'
            ? body.trackingLink
            : '',
      at: now,
    };
    order.status = 'shipped';
    order.limitShown = Boolean(order.limitOnShip);
    const view = detail(order, language);
    order.limitShown = false;
    return { data: view };
  }
  if (action === 'returns') {
    const items = (body?.items ?? []) as {
      lineId: string;
      sellable: number;
      damaged: number;
      serials?: { sellable: string[]; damaged: string[] };
    }[];
    for (const back of items) {
      const index = Number(back.lineId.split('-line-')[1]);
      const item = order.items[index];
      if (!item) continue;
      item.returned = (item.returned ?? 0) + back.sellable + back.damaged;
      if (item.serials && back.serials) {
        const gone = [...back.serials.sellable, ...back.serials.damaged];
        item.serials = {
          ...item.serials,
          sent: item.serials.sent.filter((each) => !gone.includes(each)),
        };
      }
    }
    if (order.items.every((item) => (item.returned ?? 0) >= item.quantity)) {
      order.status = 'returned';
    }
    return { data: detail(order, language) };
  }
  if (action === 'payments') {
    const amount = Number(body?.amount);
    if (amount > totalOf(order) - paidOf(order)) {
      return { refused: { status: 409, code: 'conflict', message: 'More than is due.' } };
    }
    order.payments = [
      ...(order.payments ?? []),
      {
        method: String(body?.method),
        amount,
        ...(typeof body?.senderNumber === 'string' ? { sender: body.senderNumber } : {}),
        ...(typeof body?.transactionId === 'string' ? { trxId: body.transactionId } : {}),
        at: now,
      },
    ];
    return { data: detail(order, language) };
  }
  return undefined;
}
