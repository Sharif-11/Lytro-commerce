import type { Language } from './mock-api';

// Sales against a mocked API (Slice 4.8d, the prototype's Part 32): October at Megh Fashion by week, the year by month,
// quarter or year, a product's twelve months and the best sellers, as Part 32 draws them. The profit only for someone who
// may see costs, as the server gives it.

export interface SalesFixture {
  /** `never`: nothing ever delivered. `period`: delivered, but not in the period asked. */
  empty?: 'never' | 'period';
  /** Three years by month, for a chart that scrolls. */
  many?: boolean;
  /** No sale of this product in its twelve months. */
  trendNone?: boolean;
  /** A best seller since deleted for good, at the end of the list. */
  deleted?: boolean;
  /** How many sales had no cost recorded; the sketch's 3 otherwise. */
  unknownCost?: number;
  /** CRR-17 (Phase 6): what couriers charged, and how many orders a courier carried without saying; none when left out. */
  courierCharges?: string;
  unknownCourierCharges?: number;
}

type Row = [from: string, to: string, orders: number, revenue: number];

const money = (amount: number): string => amount.toFixed(2);

const WEEKS: Row[] = [
  ['2026-10-01', '2026-10-02', 8, 12400],
  ['2026-10-03', '2026-10-09', 48, 78600],
  ['2026-10-10', '2026-10-16', 50, 81200],
  ['2026-10-17', '2026-10-23', 56, 92300],
  ['2026-10-24', '2026-10-30', 44, 74800],
  ['2026-10-31', '2026-10-31', 6, 9300],
];
const MONTHS: Row[] = [
  ['2026-01-01', '2026-01-31', 120, 172000],
  ['2026-02-01', '2026-02-28', 131, 188400],
  ['2026-03-01', '2026-03-31', 162, 240100],
  ['2026-04-01', '2026-04-30', 210, 331500],
  ['2026-05-01', '2026-05-31', 148, 219800],
  ['2026-06-01', '2026-06-30', 139, 201600],
  ['2026-07-01', '2026-07-31', 151, 222300],
  ['2026-08-01', '2026-08-31', 168, 249900],
  ['2026-09-01', '2026-09-30', 189, 287400],
  ['2026-10-01', '2026-10-31', 212, 348600],
];
const QUARTERS: Row[] = [
  ['2026-01-01', '2026-03-31', 413, 600500],
  ['2026-04-01', '2026-06-30', 497, 752900],
  ['2026-07-01', '2026-09-30', 508, 759600],
  ['2026-10-01', '2026-10-31', 212, 348600],
];
const YEARS: Row[] = [
  ['2025-01-01', '2025-12-31', 1204, 1620000],
  ['2026-01-01', '2026-10-31', 1730, 2461000],
];
const TREND: Row[] = [
  ['2025-11-01', '2025-11-30', 30, 13500],
  ['2025-12-01', '2025-12-31', 41, 18450],
  ['2026-01-01', '2026-01-31', 36, 16200],
  ['2026-02-01', '2026-02-28', 44, 19800],
  ['2026-03-01', '2026-03-31', 58, 26100],
  ['2026-04-01', '2026-04-30', 93, 41850],
  ['2026-05-01', '2026-05-31', 49, 22050],
  ['2026-06-01', '2026-06-30', 40, 18000],
  ['2026-07-01', '2026-07-31', 47, 21150],
  ['2026-08-01', '2026-08-31', 52, 23400],
  ['2026-09-01', '2026-09-30', 71, 31950],
  ['2026-10-01', '2026-10-31', 86, 38700],
];

/** Three years to last month, by month. */
function threeYears(): Row[] {
  return Array.from({ length: 36 }, (_, at): Row => {
    const start = new Date(Date.UTC(2023, 10 + at, 1));
    const end = new Date(Date.UTC(2023, 11 + at, 0));
    return [
      start.toISOString().slice(0, 10),
      end.toISOString().slice(0, 10),
      90 + at * 3,
      120000 + at * 6200 + (at % 12 === 5 ? 90000 : 0),
    ];
  });
}

const BEST: [string, [string, string], number, number, boolean][] = [
  ['p-1', ['কটন টি-শার্ট', 'Cotton T-shirt'], 86, 38700, false],
  ['p-eid', ['ঈদ কম্বো', 'Eid combo'], 34, 83300, true],
  ['p-pan', ['কটন পাঞ্জাবি', 'Cotton panjabi'], 29, 52200, false],
  ['p-lun', ['চেক লুঙ্গি', 'Check lungi'], 21, 21000, false],
  ['p-2', ['ডেনিম জ্যাকেট', 'Denim jacket'], 12, 22680, false],
  ['p-4', ['কিডস ফ্রক', 'Kids frock'], 9, 5850, false],
  ['p-3', ['সিল্ক শাড়ি', 'Silk saree'], 4, 12800, false],
  ['p-5', ['হুডি', 'Hoodie'], 3, 3750, false],
];

const NOTHING = {
  orders: 0,
  units: [],
  revenue: '0.00',
  tax: '0.00',
  deliveryCharges: '0.00',
  courierCharges: '0.00',
  unknownCourierCharges: 0,
};

/** One stretch's figure, the way `GET /sales` reads it. */
function figure(orders: number, revenue: number, tax: number, delivery: number | null) {
  return {
    orders,
    units: [{ unit: 'piece', quantity: orders.toFixed(3) }],
    revenue: money(revenue),
    tax: money(tax),
    deliveryCharges: delivery === null ? null : money(delivery),
    courierCharges: delivery === null ? null : '0.00',
    unknownCourierCharges: delivery === null ? null : 0,
  };
}

/** GET /sales and GET /sales/best-sellers; undefined for anything else. */
export function salesAnswer(
  path: string,
  url: URL,
  fixture: SalesFixture,
  maySeeCost: boolean,
  language: Language,
): unknown {
  const dateFrom = url.searchParams.get('dateFrom') ?? '2026-10-01';
  const dateTo = url.searchParams.get('dateTo') ?? '2026-10-31';
  const bucket = url.searchParams.get('bucket') ?? 'week';
  const productId = url.searchParams.get('productId');
  // A shop that sold, but not in this period: only the read of everything it ever sold finds any.
  const quiet = fixture.empty === 'period' && bucket !== 'year';
  if (path === '/sales/best-sellers') {
    const by = url.searchParams.get('by') ?? 'units';
    const limit = Number(url.searchParams.get('limit') ?? 10);
    const rows = [...BEST].sort((a, b) => (by === 'revenue' ? b[3] - a[3] : b[2] - a[2]));
    const products = rows.map(([id, name, units, revenue, combo]) => ({
      productId: id,
      name: name[language === 'bn' ? 0 : 1],
      kind: combo ? 'combo' : 'standard',
      stockUnit: 'piece',
      units: units.toFixed(3),
      revenue: money(revenue),
      orders: Math.round(units * 0.8),
    }));
    const gone = fixture.deleted
      ? [
          {
            productId: null,
            name: 'Old scarf',
            kind: 'standard',
            stockUnit: 'piece',
            units: '1.000',
            revenue: money(300),
            orders: 1,
          },
        ]
      : [];
    return { dateFrom, dateTo, by, products: [...products, ...gone].slice(0, limit) };
  }
  if (path !== '/sales') return undefined;
  if (fixture.empty === 'never' || quiet) {
    return { dateFrom, dateTo, bucket, productId, buckets: [], totals: NOTHING };
  }
  if (productId) {
    const rows = fixture.trendNone ? TREND.map(([from, to]): Row => [from, to, 0, 0]) : TREND;
    const orders = rows.reduce((sum, row) => sum + row[2], 0);
    const revenue = rows.reduce((sum, row) => sum + row[3], 0);
    return {
      dateFrom,
      dateTo,
      bucket: 'month',
      productId,
      buckets: rows.map(([from, to, count, amount]) => ({
        from,
        to,
        ...figure(count, amount, 0, null),
        units: count > 0 ? [{ unit: 'piece', quantity: count.toFixed(3) }] : [],
      })),
      totals: figure(orders, revenue, 0, null),
    };
  }
  const rows =
    bucket === 'month'
      ? fixture.many
        ? threeYears()
        : MONTHS
      : bucket === 'quarter'
        ? QUARTERS
        : bucket === 'year'
          ? YEARS
          : WEEKS;
  const week = bucket === 'week';
  const profit = maySeeCost
    ? {
        profit: {
          revenueLessTax: money(336120),
          costOfGoods: money(198400),
          profit: money(137720),
          unknownCost: fixture.unknownCost ?? 3,
        },
      }
    : {};
  return {
    dateFrom,
    dateTo,
    bucket,
    productId: null,
    buckets: rows.map(([from, to, count, amount]) => ({
      from,
      to,
      ...figure(count, amount, 0, 0),
    })),
    totals: {
      ...figure(
        week ? 212 : 1730,
        week ? 348600 : 2461000,
        week ? 12480 : 88400,
        week ? 14700 : 121100,
      ),
      courierCharges: fixture.courierCharges ?? '0.00',
      unknownCourierCharges: fixture.unknownCourierCharges ?? 0,
      ...profit,
    },
  };
}
