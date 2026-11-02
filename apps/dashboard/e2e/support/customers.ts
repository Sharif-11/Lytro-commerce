import type { Language } from './mock-api';
import { dhaka, orderSummary, type OrderFixture, type OrdersFixture } from './orders';

// Customers against a mocked API (Slice 4.8b; CUS-01, CUS-02, CUS-09, CUS-14): the six Part 30 draws, Nusrat and Rakib
// with storefront accounts, Rakib's two orders still open; a new password and the privacy delete.

type Words = [string, string];

export interface CustomerFixture {
  id: string;
  name: Words;
  /** The local form the server keeps (01XXXXXXXXX). */
  phone: string;
  orderCount: number;
  totalSpent: number;
  /** Days before today of their last order. */
  lastDaysAgo: number;
  firstOrderAt: string;
  /** Since when they have a storefront account; null for a guest. */
  accountSince: string | null;
  lastAddress: { locationId: number; street: Words } | null;
  /** Their orders in the day's list, by id. */
  orderIds: string[];
  /** Earlier orders of theirs, outside the day's list. */
  past: OrderFixture[];
  /** The order numbers still open, which refuse the privacy delete (CUS-09). */
  open: string[];
}

export interface CustomersFixture {
  customers: CustomerFixture[];
  /** New passwords set, by customer id. */
  passwords: Record<string, string>;
}

const MIRPUR = {
  thana: ['মিরপুর', 'Mirpur'] as Words,
  zilla: ['ঢাকা', 'Dhaka'] as Words,
  thanaId: 102,
  zillaId: 1,
};
const PANCHLAISH = {
  thana: ['পাঁচলাইশ', 'Panchlaish'] as Words,
  zilla: ['চট্টগ্রাম', 'Chattogram'] as Words,
  thanaId: 301,
  zillaId: 3,
};

/** An earlier order, delivered and paid: its lines add up to the total drawn, with ৳70 for delivery. */
function pastOrder(
  number: string,
  name: Words,
  area: OrderFixture['area'],
  lines: number[],
  daysAgo: number,
): OrderFixture {
  return {
    id: `o-past-${number}`,
    number,
    status: 'delivered',
    source: 'storefront',
    fulfilment: 'delivery',
    name,
    phone: '',
    area,
    createdAt: dhaka(11, 0, daysAgo),
    items: lines.map((unitPrice) => ({
      name: ['কটন টি-শার্ট', 'Cotton T-shirt'],
      quantity: 1,
      unitPrice,
    })),
    deliveryCharge: 70,
    calls: [],
  };
}

const NUSRAT: Words = ['নুসরাত জাহান', 'Nusrat Jahan'];
const SUMAIYA: Words = ['সুমাইয়া আক্তার', 'Sumaiya Akter'];

/** Part 30's `C30`, who ordered last first. */
export function drawnCustomers(): CustomersFixture {
  const common = { past: [], open: [], orderIds: [] };
  return {
    passwords: {},
    customers: [
      {
        ...common,
        id: 'c-nusrat',
        name: NUSRAT,
        phone: '01711234567',
        orderCount: 4,
        totalSpent: 5890,
        lastDaysAgo: 0,
        firstOrderAt: dhaka(11, 0, 58),
        accountSince: dhaka(11, 0, 19),
        lastAddress: {
          locationId: 102,
          street: ['বাসা 5, রোড 10, মিরপুর 11', 'House 5, Road 10, Mirpur 11'],
        },
        orderIds: ['o-47'],
        past: [
          pastOrder('261024-0033', NUSRAT, MIRPUR, [910, 910], 7),
          pastOrder('261012-0008', NUSRAT, MIRPUR, [1380], 19),
          pastOrder('260902-0002', NUSRAT, MIRPUR, [1240, 1240], 58),
        ],
      },
      {
        ...common,
        id: 'c-sumaiya',
        name: SUMAIYA,
        phone: '01819876543',
        orderCount: 2,
        totalSpent: 3780,
        lastDaysAgo: 0,
        firstOrderAt: dhaka(11, 0, 13),
        accountSince: null,
        lastAddress: {
          locationId: 301,
          street: ['বাসা 9, রোড 2, পাঁচলাইশ', 'House 9, Road 2, Panchlaish'],
        },
        orderIds: ['o-44'],
        past: [pastOrder('261018-0021', SUMAIYA, PANCHLAISH, [1380], 13)],
      },
      {
        ...common,
        id: 'c-rakib',
        name: ['রাকিব হাসান', 'Rakib Hasan'],
        phone: '01912345678',
        orderCount: 3,
        totalSpent: 2190,
        lastDaysAgo: 0,
        firstOrderAt: dhaka(11, 0, 40),
        accountSince: dhaka(11, 0, 30),
        lastAddress: null,
        orderIds: ['o-46'],
        open: ['261031-0046', '261029-0027'],
      },
      {
        ...common,
        id: 'c-tanvir',
        name: ['তানভীর আহমেদ', 'Tanvir Ahmed'],
        phone: '01615551234',
        orderCount: 3,
        totalSpent: 2970,
        lastDaysAgo: 0,
        firstOrderAt: dhaka(11, 0, 33),
        accountSince: null,
        lastAddress: null,
        orderIds: ['o-43'],
      },
      {
        ...common,
        id: 'c-farhana',
        name: ['ফারহানা ইসলাম', 'Farhana Islam'],
        phone: '01712998877',
        orderCount: 1,
        totalSpent: 0,
        lastDaysAgo: 1,
        firstOrderAt: dhaka(11, 0, 1),
        accountSince: null,
        lastAddress: null,
        orderIds: ['o-39'],
      },
      {
        ...common,
        id: 'c-mahmud',
        name: ['মাহমুদ হাসান', 'Mahmud Hasan'],
        phone: '01722998877',
        orderCount: 1,
        totalSpent: 1200,
        lastDaysAgo: 1,
        firstOrderAt: dhaka(11, 0, 1),
        accountSince: null,
        lastAddress: null,
        orderIds: ['o-38'],
      },
    ],
  };
}

/** Which customer an order belongs to, for its link to them. */
export function customerIdOf(orderId: string, fixture: CustomersFixture): string | null {
  return fixture.customers.find((each) => each.orderIds.includes(orderId))?.id ?? null;
}

const say = (words: Words, language: Language): string => (language === 'bn' ? words[0] : words[1]);

function row(customer: CustomerFixture, language: Language) {
  return {
    id: customer.id,
    name: say(customer.name, language),
    phone: customer.phone,
    orderCount: customer.orderCount,
    totalSpent: customer.totalSpent.toFixed(2),
    lastOrderAt: dhaka(11, 0, customer.lastDaysAgo),
    firstOrderAt: customer.firstOrderAt,
    hasAccount: customer.accountSince !== null,
  };
}

function matches(customer: CustomerFixture, q: string): boolean {
  const needle = q.toLowerCase();
  return (
    customer.phone.includes(q) || customer.name.some((each) => each.toLowerCase().includes(needle))
  );
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

/** The customers' reads and writes, and one customer's orders; undefined for any other request. */
export function customersAnswer(
  method: string,
  path: string,
  url: URL,
  body: Record<string, unknown> | null,
  fixture: CustomersFixture,
  orders: OrdersFixture,
  language: Language,
): Answer | undefined {
  if (method === 'GET' && path === '/orders' && url.searchParams.has('customerId')) {
    const customer = fixture.customers.find(
      (each) => each.id === url.searchParams.get('customerId'),
    );
    const theirs = [
      ...orders.orders.filter((order) => customer?.orderIds.includes(order.id)),
      ...(customer?.past ?? []),
    ];
    return {
      data: {
        orders: theirs.map((order) => orderSummary(order, language)),
        page: 1,
        limit: 20,
        total: theirs.length,
        pages: 1,
      },
    };
  }
  if (method === 'GET' && path === '/customers') {
    const q = url.searchParams.get('q') ?? '';
    const limit = Number(url.searchParams.get('limit') ?? '20');
    const found = fixture.customers.filter((each) => q === '' || matches(each, q));
    return {
      data: {
        customers: found.slice(0, limit).map((each) => row(each, language)),
        page: 1,
        limit,
        total: found.length,
        pages: 1,
      },
    };
  }
  const one = /^\/customers\/([^/]+)(\/password)?$/.exec(path);
  if (!one) return undefined;
  const customer = fixture.customers.find((each) => each.id === one[1]);
  if (!customer) return { refused: { status: 404, code: 'not_found', message: 'Not found' } };
  if (method === 'GET' && !one[2]) {
    return {
      data: {
        ...row(customer, language),
        lastAddress: customer.lastAddress
          ? {
              locationId: customer.lastAddress.locationId,
              deliveryAddress: say(customer.lastAddress.street, language),
            }
          : null,
        account: customer.accountSince ? { createdAt: customer.accountSince } : null,
      },
    };
  }
  if (method === 'POST' && one[2]) {
    fixture.passwords[customer.id] = String(body?.password);
    return { data: { ok: true } };
  }
  if (method === 'DELETE' && !one[2]) {
    if (customer.open.length > 0) {
      return {
        refused: {
          status: 409,
          code: 'conflict',
          message: 'This customer has orders still open.',
          details: { orders: customer.open },
        },
      };
    }
    fixture.customers = fixture.customers.filter((each) => each.id !== customer.id);
    for (const order of orders.orders) {
      if (customer.orderIds.includes(order.id)) order.erased = true;
    }
    return { data: { ok: true } };
  }
  return undefined;
}
