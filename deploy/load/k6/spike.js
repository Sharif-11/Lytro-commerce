// The owner's two spikes (Phase 9 Slice 9.10; the viral product, 2026-11-16, and the flash sale), on a server the seeder
// filled, through Caddy -- or, in production, through Cloudflare's edge in front of it (D9-32), whose share of the load
// is the point of the viral run. Both aim at ONE product of ONE shop of the roster (SPIKE_SHOP, SPIKE_PRODUCT: indexes,
// 0 by default).
//
//   MODE=viral  shoppers arriving from a Facebook ad, from this machine through the public path (Caddy, and in
//               production Cloudflare's edge): each lands on the product's page with a click ID of its own (`?fbclid=`,
//               which the edge ignores) and asks its delivery charge for an area as the page does (a GET the edge
//               keeps). VISITS (a second, 67: about 2,000 shoppers on the page at once, each about 30 s) after
//               RAMP_SECONDS (60), held for HOLD_MINUTES (10). LANDING=1 lands on /l/ instead of /p/. No orders: from one
//               machine they'd all be one shopper, held to RTE-06's 10 a minute. Run MODE=flash beside it for those.
//   MODE=flash  a flash sale, from inside the server's network (EDGE, as the seeder runs), where each order names a
//               shopper of its own: the product's stock is set to STOCK (300) first, then ORDERS (a second, 10: 600 a
//               minute, past the shop's 180) are placed on it through the shop's website key for HOLD_MINUTES (3). It
//               counts what was placed, refused as sold out (409), refused by the shop's minute limit (429), busy (503)
//               or failed, and logs the stock after: the units held for orders match what was placed and never pass
//               STOCK. ORDERS=1 beside a viral
//               run is the ad's shoppers ordering.
//
// In either, a busy server's answer is a 503 (or 429) with Retry-After, never a 500. See deploy/load/README.md.
import { check } from 'k6';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';
import { Seller } from './lib/dashboard.js';
import { armed as checkArmed, guardScenario } from './lib/guard.js';
import { addressOf, personOf, phoneOf } from './lib/people.js';
import { call, dataOf, EDGE, hosts, hostsOption, visitorAddress } from './lib/target.js';

const ROSTER = __ENV.ROSTER_IN || 'out/roster.json';
const roster = new SharedArray('spike', () => {
  const all = JSON.parse(open(ROSTER));
  const shop = all.shops[Number(__ENV.SPIKE_SHOP || 0)];
  return [{ run: all.run, shop, locations: all.locations }];
})[0];
const SHOP = roster.shop;
const PRODUCT = SHOP.products[Number(__ENV.SPIKE_PRODUCT || 0)];
const LOCATIONS = roster.locations;
const RUN = roster.run;

const MODE = __ENV.MODE || 'viral';
const VISITS = Number(__ENV.VISITS || 67);
const ORDERS = Number(__ENV.ORDERS || 10);
const STOCK = Number(__ENV.STOCK || 300);
const RAMP_SECONDS = Number(__ENV.RAMP_SECONDS || 60);
const HOLD_MINUTES = Number(__ENV.HOLD_MINUTES || (MODE === 'flash' ? 3 : 10));
const PAGE = __ENV.LANDING === '1' ? 'l' : 'p';

const placed = new Counter('spike_orders_placed');
const soldOut = new Counter('spike_orders_sold_out');
const limited = new Counter('spike_orders_limited');
const busy = new Counter('spike_busy');
const failed = new Counter('spike_failed');

const spike =
  MODE === 'flash'
    ? {
        executor: 'constant-arrival-rate',
        exec: 'order',
        rate: ORDERS,
        timeUnit: '1s',
        duration: `${String(HOLD_MINUTES)}m`,
        preAllocatedVUs: Math.max(10, ORDERS * 2),
        maxVUs: Math.max(50, ORDERS * 20),
      }
    : {
        executor: 'ramping-arrival-rate',
        exec: 'visit',
        startRate: 0,
        timeUnit: '1s',
        stages: [
          { target: VISITS, duration: `${String(RAMP_SECONDS)}s` },
          { target: VISITS, duration: `${String(HOLD_MINUTES)}m` },
        ],
        preAllocatedVUs: Math.max(20, VISITS),
        maxVUs: Math.max(200, VISITS * 10),
      };

export const options = {
  hosts: hostsOption([SHOP.slug]),
  // D9-34: the spike stops itself once the server isn't armed (lib/guard.js), for as long as the spike lasts.
  scenarios: {
    spike,
    armed: guardScenario(
      MODE === 'flash'
        ? `${String(HOLD_MINUTES)}m`
        : `${String(RAMP_SECONDS + HOLD_MINUTES * 60)}s`,
    ),
  },
  summaryTrendStats: ['avg', 'p(50)', 'p(95)', 'p(99)', 'max'],
  thresholds: {
    // A spike may be refused as busy, never broken: no 500s.
    spike_failed: ['count==0'],
  },
};

const iteration = () => exec.scenario.iterationInTest;
const pick = (list, seed) => list[Math.abs(seed) % list.length];

/** What an answer was, counted: placed, sold out, the shop's limit, busy, or a failure. */
function counted(answer, success) {
  if (success.includes(answer.status)) return true;
  if (answer.status === 429) limited.add(1);
  if (answer.status === 503) busy.add(1);
  if (answer.status >= 500 && answer.status !== 503) failed.add(1);
  return false;
}

function orderBody(n) {
  const customer = 100_000 + (n % 100_000);
  return {
    customerName: personOf(customer),
    phone: phoneOf(1 + (n % 9), customer),
    locationId: pick(LOCATIONS, n),
    deliveryAddress: addressOf(customer),
    items: [{ variantId: PRODUCT.variantId, quantity: 1 }],
  };
}

function placeOrder(n) {
  const answer = call('POST', hosts.api, '/v1/orders', orderBody(n), {
    headers: {
      authorization: `Bearer ${SHOP.key}`,
      origin: SHOP.site,
      'idempotency-key': `${RUN}-flash-${String(n)}-${String(Date.now())}`,
    },
    visitor: visitorAddress(200_000 + n),
    tags: { kind: 'order' },
  });
  if (counted(answer, [200, 201])) {
    placed.add(1);
    return;
  }
  // The server's word for an item gone while it was ordered (409), not a failure of the server.
  if (answer.status === 409) soldOut.add(1);
}

/** One shopper from the ad: the page with a click ID of its own, its delivery charge, and sometimes the order. */
export function visit() {
  const n = iteration();
  const landed = call(
    'GET',
    hosts.shop(SHOP.slug),
    `/${PAGE}/${PRODUCT.slug}?fbclid=IwAR${RUN}${String(n)}`,
    null,
    { tags: { kind: 'page', page: PAGE } },
  );
  check(landed, { 'the page loads, or says it is busy': (r) => [200, 503].includes(r.status) });
  counted(landed, [200]);
  const area = pick(LOCATIONS, n);
  const charge = call(
    'GET',
    hosts.shop(SHOP.slug),
    `/api/estimate?p=${PRODUCT.id}&v=${PRODUCT.variantId}&q=1&a=${String(area)}`,
    null,
    { tags: { kind: 'read', read: 'estimate' } },
  );
  counted(charge, [200]);
}

/** One order in the flash sale. */
export function order() {
  placeOrder(iteration());
}

/** D9-34: the guard's check, every few seconds all through the spike (lib/guard.js). */
export function armed() {
  checkArmed();
}

/** The flash sale's product holds STOCK, and nothing more, before the sale opens. */
export function setup() {
  if (MODE !== 'flash') return {};
  if (!EDGE)
    throw new Error("the flash sale runs inside the server's network (EDGE), as the seeder does");
  const seller = new Seller(SHOP);
  const set = seller.send(
    'PUT',
    `/products/${PRODUCT.id}/variants/${PRODUCT.variantId}/stock`,
    { onHand: STOCK },
    { kind: 'write' },
  );
  if (set.status !== 200)
    throw new Error(`the flash sale's stock wasn't set: ${String(set.status)}`);
  return {};
}

/** What the product holds after the sale, for the report: never below 0. */
export function teardown() {
  if (MODE !== 'flash') return;
  const seller = new Seller(SHOP);
  const stock = seller.get(`/products/${PRODUCT.id}/stock`, { kind: 'read' });
  const view = dataOf(stock);
  const variant = (view?.variants ?? []).find((each) => each.variantId === PRODUCT.variantId);
  // An order holds its units (reserved) until it ships: what's held never passes what's on hand.
  console.log(
    `flash sale: ${String(STOCK)} on hand before; after: on hand ${JSON.stringify(variant?.onHand ?? null)}, ` +
      `held for orders ${JSON.stringify(variant?.reserved ?? null)} (the run's spike_orders_placed should match)`,
  );
}

export function handleSummary(data) {
  const out = __ENV.SUMMARY || `out/${MODE}-summary.json`;
  return {
    [out]: JSON.stringify(data),
    stdout: `${textSummary(data, { indent: ' ', enableColors: false })}\n\nsummary in ${out}\n`,
  };
}
