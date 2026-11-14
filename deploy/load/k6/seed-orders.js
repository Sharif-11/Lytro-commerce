// The seeder's fourth step (deploy/load/run/seed.sh), Phase 9 Slice 9.10: a year of each shop's orders, placed through
// its own website's key as shoppers place them, then confirmed, shipped, delivered or cancelled through the dashboard as
// its staff move them. A full shop gets the capacity model's 3,600 orders from 1,000 customers; a small one 100.
// spread-year.sql then spreads their times over the past year. Runs through the internal edge (EDGE): each customer
// has a visitor address of their own, so RTE-06's ten orders a minute counts customers, not this machine.
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
import { Seller } from './lib/dashboard.js';
import { addressOf, personOf, phoneOf } from './lib/people.js';
import { call, dataOf, hosts, visitorAddress } from './lib/target.js';

const roster = JSON.parse(open(__ENV.ROSTER_IN || 'out/roster.json'));
const FULL_ORDERS = Number(__ENV.FULL_ORDERS || 3600);
const SMALL_ORDERS = Number(__ENV.SMALL_ORDERS || 100);
const CUSTOMERS = Number(__ENV.CUSTOMERS || 1000);

// Every order to place, as [shop, its number in that shop], the shops taken in turn so all of them fill at once.
const plan = new SharedArray('orders', () => {
  const wanted = roster.shops.map((shop) => (shop.full ? FULL_ORDERS : SMALL_ORDERS));
  const orders = [];
  for (let nth = 0; nth < Math.max(...wanted); nth += 1) {
    roster.shops.forEach((_, shop) => {
      if (nth < wanted[shop]) orders.push([shop, nth]);
    });
  }
  return orders;
});

// A shop takes 60 orders a minute (public_orders_per_shop_per_minute, Slice 4.2): each one here gets PER_SHOP of them,
// all shops at once while the small ones still need orders, then the full ones alone. Staging's shakedown found the run
// otherwise outran it (1,050 refused, 2026-11-14).
const PER_SHOP = Number(__ENV.PER_SHOP || 50);
const shopsAll = roster.shops.length;
const shopsFull = roster.shops.filter((shop) => shop.full).length;
const together = Math.min(SMALL_ORDERS, FULL_ORDERS);
const fullAlone = shopsFull > 0 ? Math.max(0, FULL_ORDERS - SMALL_ORDERS) : 0;
const seconds = (orders) => `${String(Math.ceil((orders * 60) / PER_SHOP))}s`;

export const options = {
  scenarios: {
    orders: {
      executor: 'ramping-arrival-rate',
      timeUnit: '1m',
      startRate: shopsAll * PER_SHOP,
      stages: [
        { target: shopsAll * PER_SHOP, duration: seconds(together) },
        { target: Math.max(1, shopsFull * PER_SHOP), duration: '1s' },
        { target: Math.max(1, shopsFull * PER_SHOP), duration: seconds(fullAlone) },
        // The tail: arrivals left over after the plan's last order do nothing.
        { target: 1, duration: '30s' },
      ],
      preAllocatedVUs: Math.max(10, Math.ceil((shopsAll * PER_SHOP) / 60) * 3),
      maxVUs: Number(__ENV.VUS || 300),
    },
  },
  summaryTrendStats: ['p(95)'],
  thresholds: { checks: ['rate>0.99'] },
};

// What becomes of an order, by its number: most delivered, as a shop's year looks (RPT-01's sales are delivered ones).
function fateOf(nth) {
  const share = (nth * 37) % 100;
  if (share < 70) return 'delivered';
  if (share < 78) return 'cancelled';
  if (share < 88) return 'shipped';
  if (share < 95) return 'confirmed';
  return 'placed';
}

export default function placeOne() {
  const next = plan[exec.scenario.iterationInTest];
  if (!next) return;
  const [index, nth] = next;
  const shop = roster.shops[index];
  const cod = shop.products.filter((product) => !product.advance);
  const product = cod[(nth * 7) % cod.length];
  const customer = nth % CUSTOMERS;
  const placed = call(
    'POST',
    hosts.api,
    '/v1/orders',
    {
      customerName: personOf(customer),
      phone: phoneOf(1 + (index % 9), customer),
      locationId: roster.locations[customer % roster.locations.length],
      deliveryAddress: addressOf(customer),
      items: [{ variantId: product.variantId, quantity: 1 + (nth % 2) }],
    },
    {
      headers: {
        authorization: `Bearer ${shop.key}`,
        origin: shop.site,
        'idempotency-key': `${roster.run}-${String(index)}-${String(nth)}`,
      },
      visitor: visitorAddress(100_000 + index * CUSTOMERS + customer),
      tags: { step: 'place' },
    },
  );
  if (!check(placed, { 'the order is placed': (answer) => answer.status === 201 })) {
    console.error(`${shop.slug} #${String(nth)}: ${String(placed.status)} ${placed.body}`);
    return;
  }
  // A seeding run again: an order an earlier run placed comes back as it was (API-11's replay), already moved on.
  if (placed.headers['Idempotent-Replay'] === 'true') return;
  const fate = fateOf(nth);
  if (fate === 'placed') return;

  const seller = new Seller(shop);
  const number = dataOf(placed).orderNumber;
  const found = dataOf(seller.get(`/orders?q=${number}&limit=1`, { step: 'find' }));
  const id = found?.orders?.[0]?.id ?? found?.items?.[0]?.id;
  if (!check(id, { 'the order is found': (value) => Boolean(value) })) return;
  const steps = {
    cancelled: [['POST', `/orders/${id}/cancel`, { reason: 'customer_cancelled' }]],
    confirmed: [['POST', `/orders/${id}/calls`, { outcome: 'confirmed' }]],
    shipped: [
      ['POST', `/orders/${id}/calls`, { outcome: 'confirmed' }],
      ['POST', `/orders/${id}/ship`, { courierName: 'Steadfast', trackingCode: `LT${number}` }],
    ],
    delivered: [
      ['POST', `/orders/${id}/calls`, { outcome: 'confirmed' }],
      ['POST', `/orders/${id}/ship`, { courierName: 'Steadfast', trackingCode: `LT${number}` }],
      ['POST', `/orders/${id}/deliver`, {}],
    ],
  }[fate];
  for (const [method, path, body] of steps) {
    const moved = seller.send(method, path, body, { step: path.split('/').pop() });
    if (
      !check(moved, {
        'the order moves on': (answer) => answer.status === 200 || answer.status === 201,
      })
    ) {
      console.error(`${shop.slug} ${number} ${path}: ${String(moved.status)} ${moved.body}`);
      return;
    }
  }
}
