// The load test itself (Phase 9 Slice 9.10; PRF-01, PRF-03, DAT-32), on a server the seeder filled. Everything goes to
// https://<host> through Caddy, as browsers and phones reach it. At FACTOR 1 it is the capacity model's peak for 100 shops
// (SRS-detailed.md, SCL-01's document); the pass runs at 2.
//
//   MODE=pass     ramp up for RAMP_MINUTES (5), hold FACTOR for MINUTES (30), with the launch burst of SIGNUPS (200) sign-ups in
//                 10 minutes from its 10th minute. The thresholds below are the pass.
//   MODE=ceiling  start at FACTOR and add STEP every 5 minutes up to MAX_FACTOR, stopping when errors pass 5% or reads'
//                 95th percentile passes 2 s: where it stopped is the ceiling.
//
// The roster (out/roster.json) is the seeder's. See deploy/load/README.md for the settings the server needs first.
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
// k6's own end-of-run summary, which a handleSummary of one's own otherwise replaces.
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';
import { Seller, signUp } from './lib/dashboard.js';
import { readReport, signInOperator } from './lib/operator.js';
import { addressOf, personOf, phoneOf, SEARCHES } from './lib/people.js';
import { call, dataOf, hosts, hostsOption } from './lib/target.js';

const ROSTER = __ENV.ROSTER_IN || 'out/roster.json';
const shops = new SharedArray('shops', () => JSON.parse(open(ROSTER)).shops);
const locations = new SharedArray('locations', () => JSON.parse(open(ROSTER)).locations);
// The roster's small parts, read once for every VU like the rest: a few hundred VUs each parsing it would cost memory.
const meta = new SharedArray('meta', () => {
  const roster = JSON.parse(open(ROSTER));
  return [{ run: roster.run, operator: roster.operator ?? null }];
})[0];
const RUN = meta.run;

const MODE = __ENV.MODE || 'pass';
const FACTOR = Number(__ENV.FACTOR || 2);
const MINUTES = Number(__ENV.MINUTES || 30);
const SIGNUPS = Number(__ENV.SIGNUPS || 200);
const STEP = Number(__ENV.STEP || 2);
const MAX_FACTOR = Number(__ENV.MAX_FACTOR || 20);
const RAMP_MINUTES = Number(__ENV.RAMP_MINUTES || 5);
// The launch burst: SIGNUPS over SIGNUP_MINUTES, from minute SIGNUP_START_MINUTES of the run.
const SIGNUP_MINUTES = Number(__ENV.SIGNUP_MINUTES || 10);
const SIGNUP_START_MINUTES = Number(__ENV.SIGNUP_START_MINUTES || 10);
const APP_VERSION = '1.0.0';

// The capacity model's peak for 100 shops, a minute, at FACTOR 1. 46 catalogue requests a second: four in five from the
// storefronts (a visit is about 8 of them) and one in five from shops' own websites (about 4 a visit); 0.23 orders a
// second, 70% at a storefront's checkout; 8 dashboard and API requests a second. Phones beat every 15 minutes, whatever
// the load (LSN-03), and aren't scaled.
const AT_ONE = {
  shoppers: 276,
  websites: 138,
  storefrontOrders: 9.66,
  websiteOrders: 4.14,
  sellers: 480,
};

function stages(perMinute) {
  if (MODE === 'ceiling') {
    const list = [];
    for (let factor = FACTOR; factor <= MAX_FACTOR; factor += STEP) {
      list.push({ target: Math.max(1, Math.round(perMinute * factor)), duration: '1m' });
      list.push({ target: Math.max(1, Math.round(perMinute * factor)), duration: '4m' });
    }
    return list;
  }
  const held = Math.max(1, Math.round(perMinute * FACTOR));
  return [
    { target: held, duration: `${String(RAMP_MINUTES)}m` },
    { target: held, duration: `${String(MINUTES)}m` },
    { target: 0, duration: '1m' },
  ];
}

function scenario(name, perMinute, vus) {
  return {
    executor: 'ramping-arrival-rate',
    exec: name,
    startRate: 0,
    timeUnit: '1m',
    stages: stages(perMinute),
    preAllocatedVUs: vus,
    maxVUs: vus * 10,
  };
}

const scenarios = {
  shoppers: scenario('shopper', AT_ONE.shoppers, 60),
  websites: scenario('website', AT_ONE.websites, 15),
  storefrontOrders: scenario('storefrontOrder', AT_ONE.storefrontOrders, 5),
  websiteOrders: scenario('websiteOrder', AT_ONE.websiteOrders, 5),
  sellers: scenario('seller', AT_ONE.sellers, 20),
  // Each shop's phone once every 15 minutes, never sooner: the server takes 4 beats an hour (LSN-03), and staging's
  // shakedown found a rate rounded up to a minute made 10 phones beat every 10 minutes.
  phones: {
    executor: 'constant-arrival-rate',
    exec: 'phone',
    rate: shops.length,
    timeUnit: '15m',
    duration: MODE === 'ceiling' ? '100m' : `${String(RAMP_MINUTES + MINUTES + 1)}m`,
    preAllocatedVUs: 2,
  },
};
// DAT-18: Lytro's operator reading reports twice a minute, all through the run, while shops order.
if (meta.operator) {
  scenarios.operator = {
    executor: 'constant-arrival-rate',
    exec: 'operator',
    rate: 2,
    timeUnit: '1m',
    duration: MODE === 'ceiling' ? '100m' : `${String(RAMP_MINUTES + MINUTES + 1)}m`,
    preAllocatedVUs: 2,
  };
}
if (MODE === 'pass' && SIGNUPS > 0) {
  scenarios.signups = {
    executor: 'constant-arrival-rate',
    exec: 'signup',
    rate: Math.max(1, Math.round(SIGNUPS / SIGNUP_MINUTES)),
    timeUnit: '1m',
    startTime: `${String(SIGNUP_START_MINUTES)}m`,
    duration: `${String(SIGNUP_MINUTES)}m`,
    preAllocatedVUs: 10,
    maxVUs: 60,
  };
}

// Scenarios left out by name, e.g. SKIP=shoppers,storefrontOrders on a machine with no storefront running.
for (const name of (__ENV.SKIP || '').split(',').filter(Boolean)) delete scenarios[name];

const ceilingStop = { abortOnFail: true, delayAbortEval: '1m' };
export const options = {
  hosts: hostsOption(shops.map((shop) => shop.slug)),
  scenarios,
  summaryTrendStats: ['avg', 'p(50)', 'p(95)', 'p(99)', 'max'],
  thresholds:
    MODE === 'ceiling'
      ? {
          http_req_failed: [{ threshold: 'rate<0.05', ...ceilingStop }],
          'http_req_duration{kind:read}': [{ threshold: 'p(95)<2000', ...ceilingStop }],
        }
      : {
          // PRF-01: under 1% errors. PRF-03: API reads under 500 ms at the 95th percentile. CCH-12: search under 300 ms.
          http_req_failed: ['rate<0.01'],
          'http_req_duration{kind:read}': ['p(95)<500'],
          'http_req_duration{kind:search}': ['p(95)<300'],
          checks: ['rate>0.99'],
        },
};

const pick = (list, seed) => list[Math.abs(seed) % list.length];

// A check that also says what failed, the first few times in each VU, so a run's report can name the route.
let told = 0;
function ok(answer, name, statuses) {
  const passed = check(answer, { [name]: (response) => statuses.includes(response.status) });
  if (!passed && told < 5) {
    told += 1;
    console.warn(
      `${name}: ${String(answer.status)} ${answer.request.method} ${answer.url.split('?')[0]}`,
    );
  }
  return passed;
}
const pause = (seconds) => sleep(seconds * (0.5 + Math.random()));
const iteration = () => exec.scenario.iterationInTest;

function page(slug, path) {
  const answer = call('GET', hosts.shop(slug), path, null, {
    tags: { kind: 'page', page: path.split('?')[0].split('/')[1] || 'home' },
  });
  ok(answer, 'the page loads', [200]);
  return answer;
}

/** A shopper's visit to a storefront: its home, a category or a search, a product and its delivery charge, now and then the cart. */
export function shopper() {
  const n = iteration();
  const shop = pick(shops, n * 7919);
  page(shop.slug, '/');
  pause(2);
  if (n % 2 === 0) {
    const category = pick(shop.categories, n);
    if (category?.slug) page(shop.slug, `/c/${category.slug}`);
  } else {
    page(shop.slug, `/search?q=${pick(SEARCHES, n)}`);
  }
  pause(2);
  const product = pick(shop.products, n * 31);
  page(shop.slug, `/p/${product.slug}`);
  const estimate = call(
    'POST',
    hosts.shop(shop.slug),
    '/api/estimate',
    {
      locationId: pick(locations, n),
      items: [{ variantId: product.variantId, quantity: 1 }],
    },
    { tags: { kind: 'read', read: 'estimate' } },
  );
  ok(estimate, 'the delivery charge reads', [200]);
  if (n % 7 === 0) {
    pause(2);
    page(shop.slug, '/cart');
  }
}

function websiteHeaders(shop) {
  return { authorization: `Bearer ${shop.key}`, origin: shop.site };
}

/** A visit to a shop's own website, which reads its catalogue through the public API with the shop's key. */
export function website() {
  const n = iteration();
  const shop = pick(shops, n * 104729);
  const headers = websiteHeaders(shop);
  const search = n % 3 === 0;
  const listed = call(
    'GET',
    hosts.api,
    search
      ? `/v1/catalogue/products?search=${pick(SEARCHES, n)}&limit=20`
      : '/v1/catalogue/products?limit=20',
    null,
    {
      headers,
      tags: { kind: search ? 'search' : 'read', read: 'products' },
    },
  );
  ok(listed, 'the products read', [200]);
  pause(2);
  const product = pick(shop.products, n * 17);
  const detail = call('GET', hosts.api, `/v1/catalogue/products/${product.slug}`, null, {
    headers,
    tags: { kind: 'read', read: 'product' },
  });
  ok(detail, 'the product reads', [200]);
  const estimate = call(
    'POST',
    hosts.api,
    '/v1/delivery-estimate',
    {
      locationId: pick(locations, n),
      items: [{ variantId: product.variantId, quantity: 1 }],
    },
    { headers, tags: { kind: 'read', read: 'estimate' } },
  );
  ok(estimate, 'the delivery charge reads', [200]);
}

function orderOf(shop, n, source) {
  const product = pick(shop.products, n * 13);
  const customer = n % 1000;
  return {
    product,
    body: {
      customerName: personOf(customer),
      phone: phoneOf(1 + (n % 9), customer),
      locationId: pick(locations, n),
      deliveryAddress: addressOf(customer),
      source,
      items: [{ variantId: product.variantId, quantity: 1 }],
      ...(product.advance
        ? { payment: { method: 'bkash', returnUrl: `${shop.site}/thanks` } }
        : {}),
    },
  };
}

/** An order needing an advance opens its payment page (PAY-01), which the shopper loads. */
function payPage(placed) {
  const url = dataOf(placed)?.payment?.paymentUrl;
  if (!url) return;
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  const answer = call('GET', hosts.pay, path, null, { tags: { kind: 'page', page: 'pay' } });
  ok(answer, 'the payment page loads', [200]);
}

/** A shopper's checkout on a storefront: its own server holds the key and passes the order on (SFT-06). */
export function storefrontOrder() {
  const n = iteration();
  const shop = pick(shops, n * 7);
  const { body } = orderOf(shop, n, 'storefront');
  page(shop.slug, '/checkout');
  const placed = call('POST', hosts.shop(shop.slug), '/api/orders', body, {
    headers: { 'idempotency-key': `${RUN}-load-sf-${String(n)}-${String(Date.now())}` },
    tags: { kind: 'order' },
  });
  ok(placed, 'the order is placed', [200, 201]);
  payPage(placed);
}

/** An order from a shop's own website, then its tracking page's read. */
export function websiteOrder() {
  const n = iteration();
  const shop = pick(shops, n * 11);
  const headers = websiteHeaders(shop);
  const { body } = orderOf(shop, n, undefined);
  const placed = call('POST', hosts.api, '/v1/orders', body, {
    headers: {
      ...headers,
      'idempotency-key': `${RUN}-load-web-${String(n)}-${String(Date.now())}`,
    },
    tags: { kind: 'order' },
  });
  if (!ok(placed, 'the order is placed', [201])) return;
  payPage(placed);
  const tracked = call('GET', hosts.api, `/v1/track/${dataOf(placed).trackingId}`, null, {
    headers,
    tags: { kind: 'read', read: 'track' },
  });
  ok(tracked, 'the tracking reads', [200]);
}

/** One thing a seller does with the dashboard open: its minute's polls, a list, an order, a stock change. */
export function seller() {
  const n = iteration();
  const shop = pick(shops, n * 3);
  const seller = new Seller(shop);
  const share = (n * 37) % 100;
  const read = (path, name) => {
    const answer = seller.get(path, { kind: 'read', read: name });
    ok(answer, 'the dashboard reads', [200]);
    return answer;
  };
  if (share < 25) read('/notices/summary', 'notices');
  else if (share < 50) read('/notifications', 'notifications');
  else if (share < 70) read('/orders?page=1', 'orders');
  else if (share < 80) {
    const listed = dataOf(read('/orders?page=1&limit=5', 'orders'));
    const id = (listed?.orders ?? listed?.items ?? [])[0]?.id;
    if (id) read(`/orders/${id}`, 'order');
  } else if (share < 90) read('/products?page=1', 'products');
  else if (share < 95) read('/home', 'home');
  else {
    const product = pick(shop.products, n);
    const changed = seller.send(
      'PUT',
      `/products/${product.id}/variants/${product.variantId}/stock`,
      { onHand: 100_000 },
      {
        kind: 'write',
      },
    );
    ok(changed, 'the stock changes', [200]);
  }
}

/** The operator's one session for the whole run, signed in before the load starts. */
export function setup() {
  if (!meta.operator) return { operator: null };
  const result = signInOperator(meta.operator);
  if (result.failed) console.error(`the operator: ${result.failed}`);
  return { operator: result.session ?? null };
}

/** One of the operator's reports over the past year (DAT-18). */
export function operator(data) {
  if (!data.operator) return;
  const path = pick(
    [
      'reports/revenue?bucket=month',
      'reports/shops?bucket=month',
      'reports/consumers?metric=sms',
      'tenants?page=1',
    ],
    iteration(),
  );
  const answer = readReport(data.operator, path);
  ok(answer, 'the report reads', [200]);
}

/** A paired phone reporting in (LSN-03), every 15 minutes. */
export function phone() {
  const shop = pick(shops, iteration());
  if (!shop.phone) return;
  const beat = call('POST', hosts.api, '/v1/listener/heartbeat', null, {
    headers: {
      authorization: `Bearer ${shop.phone.token}`,
      'x-installation-id': shop.phone.installationId,
      'x-app-version': APP_VERSION,
    },
    tags: { kind: 'write', write: 'heartbeat' },
  });
  ok(beat, 'the phone reports in', [200]);
}

/** The launch burst: a new seller signing up and opening a shop (PRF-01). */
export function signup() {
  const n = iteration();
  const result = signUp({
    phone: phoneOf(9, 500_000 + n + (Date.now() % 100_000) * 10),
    ownerName: personOf(n),
    shopName: `Launch shop ${String(n)}`,
    slug: `${RUN}-n${String(Date.now() % 1_000_000)}${String(n)}`,
  });
  check(result, { 'the seller signs up': (value) => Boolean(value.seller) });
  if (result.failed) console.error(`sign-up ${String(n)}: ${result.failed}`);
}

export function handleSummary(data) {
  const out = __ENV.SUMMARY || `out/${MODE}-summary.json`;
  return {
    [out]: JSON.stringify(data),
    stdout: `${textSummary(data, { indent: ' ', enableColors: false })}\n\nsummary in ${out}\n`,
  };
}
