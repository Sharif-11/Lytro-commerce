// The seeder's third step (deploy/load/run/seed.sh, after seed-limits.sql), Phase 9 Slice 9.10: each shop's catalogue,
// website key, bKash number and paired phone, made through the dashboard as a seller makes them. A full shop gets the
// capacity model's 300 products, a small one 20. Reads the roster seed-shops.js wrote and writes it again with what was
// made, for seed-orders.js and the load.
//
// One request per shop at a time, many shops at once, as sellers work: a shop's catalogue changes take its lock in turn
// (ProductRepository.lockCatalogue), so a shop's 25 at once waited on each other and ran into the statement timeout.
import { Seller } from './lib/dashboard.js';
import { CATEGORY_NAMES, productOf } from './lib/people.js';
import { call, callAll, dataOf, hosts } from './lib/target.js';

const roster = JSON.parse(open(__ENV.ROSTER_IN || 'out/shops.json'));
const FULL_SHOPS = Number(__ENV.FULL_SHOPS || 50);
const FULL_PRODUCTS = Number(__ENV.FULL_PRODUCTS || 300);
const SMALL_PRODUCTS = Number(__ENV.SMALL_PRODUCTS || 20);
// One product in ten takes an advance by bKash, so the payment page has its share of the load.
const ADVANCE_EVERY = 10;
// How many shops make one thing each at once.
const SHOPS_AT_ONCE = Number(__ENV.SHOPS_AT_ONCE || 20);
const APP_VERSION = '1.0.0';

export const options = {
  setupTimeout: '180m',
  vus: 1,
  iterations: 1,
  summaryTrendStats: ['p(95)'],
};

/** Runs one request for each of `items` (its shop's request built by `requestOf`), SHOPS_AT_ONCE shops at a time. */
function eachShop(items, requestOf) {
  const answers = [];
  for (let first = 0; first < items.length; first += SHOPS_AT_ONCE) {
    answers.push(...callAll(items.slice(first, first + SHOPS_AT_ONCE).map(requestOf)));
  }
  return answers;
}

function productBody(index, categories) {
  const product = productOf(index);
  const advance = index % ADVANCE_EVERY === ADVANCE_EVERY - 1;
  return {
    name: product.name,
    basePrice: product.basePrice,
    categoryIds: categories[product.kind]?.id ? [categories[product.kind].id] : [],
    ...(advance
      ? { paymentPolicy: 'partial_advance', advanceAmount: Math.round(product.basePrice / 4) }
      : {}),
    variants: [{ optionIds: [], openingStock: 100_000 }],
  };
}

/** A paired phone, as the listener app pairs with the shop's own code (LSN-03). */
function phoneOf(seller) {
  const code = dataOf(seller.send('POST', '/listener/pairing-codes', {}))?.code;
  if (!code) return null;
  const installationId = `load-${seller.slug}`;
  const paired = call(
    'POST',
    hosts.api,
    '/v1/listener/pair',
    { code, installationId, model: 'Redmi 12' },
    { headers: { 'x-app-version': APP_VERSION } },
  );
  const token = dataOf(paired)?.token;
  return token ? { token, installationId } : null;
}

export function setup() {
  const failed = [];
  const shops = roster.shops.map((entry) => ({
    ...entry,
    full: entry.index < FULL_SHOPS,
    site: `https://${entry.slug}.example.com`,
    seller: new Seller(entry),
    categories: [],
    products: [],
  }));

  for (const name of CATEGORY_NAMES) {
    eachShop(shops, (shop) => [
      'POST',
      hosts.app,
      '/api/v1/categories',
      { name },
      { headers: shop.seller.headers(true), tags: { step: 'category' } },
    ]).forEach((answer, index) => {
      shops[index].categories.push({ id: dataOf(answer)?.id, slug: dataOf(answer)?.slug });
    });
  }

  const most = Math.max(FULL_PRODUCTS, SMALL_PRODUCTS);
  for (let index = 0; index < most; index += 1) {
    const due = shops.filter((shop) => index < (shop.full ? FULL_PRODUCTS : SMALL_PRODUCTS));
    eachShop(due, (shop) => [
      'POST',
      hosts.app,
      '/api/v1/products',
      productBody(index, shop.categories),
      { headers: shop.seller.headers(true), tags: { step: 'product' } },
    ]).forEach((answer, at) => {
      const shop = due[at];
      const product = dataOf(answer);
      if (answer.status !== 201 || !product) {
        console.error(
          `${shop.slug}: product ${String(index)}: ${String(answer.status)} ${answer.body}`,
        );
        return;
      }
      shop.products.push({
        id: product.id,
        slug: product.slug,
        variantId: product.variants?.[0]?.id,
        advance: index % ADVANCE_EVERY === ADVANCE_EVERY - 1,
        category: index % CATEGORY_NAMES.length,
      });
    });
  }

  const made = shops.map((shop) => {
    const key = dataOf(
      shop.seller.send('POST', '/api-keys', { name: 'Own website', websites: [shop.site] }),
    )?.key;
    const wallet = shop.seller.send('PUT', '/payment-methods/bkash', {
      enabled: true,
      accounts: [
        { accountName: 'Shop bKash', number: '01711000001', accountType: 'personal', active: true },
      ],
    });
    const phone = phoneOf(shop.seller);
    if (!key || wallet.status !== 200 || shop.products.length === 0 || !phone) {
      failed.push(
        `${shop.slug}: key ${String(Boolean(key))}, wallet ${String(wallet.status)}, ${String(shop.products.length)} products, phone ${String(Boolean(phone))}`,
      );
    }
    const { seller, ...kept } = shop;
    return { ...kept, ...seller.toJSON(), key, phone };
  });

  const zillas = dataOf(made[0] ? new Seller(made[0]).get('/locations') : null)?.zillas ?? [];
  const locations = zillas.flatMap((zilla) => zilla.thanas.map((thana) => thana.id)).slice(0, 200);
  // The load test's operator (seed.sh made it), for load.js's reports (DAT-18).
  const operator = __ENV.OPERATOR_EMAIL
    ? { email: __ENV.OPERATOR_EMAIL, password: __ENV.OPERATOR_PASSWORD }
    : null;
  return { ...roster, shops: made, locations, operator, failed };
}

export default function noLoad() {
  // Everything happens in setup, written to the roster as one list.
}

export function handleSummary(data) {
  const roster = data.setup_data ?? { shops: [], failed: ['no setup data'] };
  const products = roster.shops.reduce((sum, shop) => sum + shop.products.length, 0);
  const line = `catalogues for ${String(roster.shops.length)} shops, ${String(products)} products, ${String(roster.locations?.length ?? 0)} delivery areas; failed: ${String(roster.failed.length)}\n${roster.failed.slice(0, 10).join('\n')}\n`;
  return { [__ENV.ROSTER || 'out/roster.json']: JSON.stringify(roster), stdout: line };
}
