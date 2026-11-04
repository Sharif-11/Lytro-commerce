import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { OrderStatus, StockState } from '@lytronix/validators/enums';
import type {
  DeliveryEstimate,
  EstimateLine,
  ModifierChoice,
  OrderItemInput,
  TaxLine,
  TrackedOrder,
} from '../../src/lib/api/storefront-api';
import { CODE, type ProductFixture, type SentOrder, type ShopFixture } from './fixtures';

// The server as the storefront's own server meets it, over HTTP, because the pages are rendered there: which shop a host
// serves, the public catalogue, the estimate and order creation. A test names its own shop (`POST /__shop`), by a slug
// made for it, so tests run side by side; `GET /__orders/:slug` says what that shop was sent. Its pricing is a small
// copy of the server's rule, for the numbers a page shows; the real rule is proven by the server's own tests.

export const MOCK_PORT = 4181;
export const STOREFRONT_PORT = 4180;

interface ShopState {
  fixture: ShopFixture;
  orders: SentOrder[];
  placedByKey: Map<string, { hash: string; placed: unknown }>;
  /** How many order requests arrived, placed or not. */
  orderRequests: number;
  /** CUS-03: each sign-in's phone by its token. */
  tokens: Map<string, string>;
  /** AUTH-14: wrong passwords by phone. */
  wrongTries: Map<string, number>;
  /** How many code and sign-in requests arrived. */
  shopperRequests: number;
}

const shops = new Map<string, ShopState>();

function send(response: ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ success: true, statusCode: status, message: 'ok', data }));
}

function fail(
  response: ServerResponse,
  status: number,
  code: string,
  details: Record<string, unknown> = {},
): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({
      success: false,
      statusCode: status,
      message: code,
      errors: { code, details },
    }),
  );
}

function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      resolve(text === '' ? null : JSON.parse(text));
    });
  });
}

function findVariant(fixture: ShopFixture, variantId: string) {
  for (const row of fixture.products) {
    const variant = row.product.variants.find((each) => each.id === variantId);
    if (variant) return { row, variant };
  }
  return null;
}

const money = (amount: number) => amount.toFixed(2);

/** The options a line ends up with, by the order's rule: those named, each group not named its defaults. */
function chosen(row: ProductFixture, named: readonly ModifierChoice[] | undefined) {
  let fits = true;
  const byGroup = new Map((named ?? []).map((choice) => [choice.groupId, choice.optionIds]));
  for (const groupId of byGroup.keys()) {
    if (!row.product.modifierGroups.some((group) => group.id === groupId)) fits = false;
  }
  const options = row.product.modifierGroups.flatMap((group) => {
    const ids =
      byGroup.get(group.id) ??
      group.options.filter((option) => option.isDefault).map((option) => option.id);
    if (ids.length < group.minSelect || ids.length > group.maxSelect) fits = false;
    if (ids.some((id) => !group.options.some((option) => option.id === id))) fits = false;
    return group.options
      .filter((option) => ids.includes(option.id))
      .map((option) => ({ group: group.name, ...option }));
  });
  return { options, fits };
}

function unitOf(row: ProductFixture, variantPrice: string, named?: readonly ModifierChoice[]) {
  return chosen(row, named).options.reduce(
    (sum, option) => sum + Number(option.priceChange),
    Number(variantPrice),
  );
}

function taxesOf(rows: { tax: ProductFixture['tax']; total: number }[]): TaxLine[] {
  const byClass = new Map<string, TaxLine>();
  for (const { tax, total } of rows) {
    if (!tax) continue;
    const key = `${tax.name} ${tax.rate}`;
    const rate = Number(tax.rate);
    const part = Math.round(((total * rate) / (100 + rate)) * 100) / 100;
    const held = byClass.get(key);
    byClass.set(key, {
      name: tax.name,
      rate: tax.rate,
      amount: money((held ? Number(held.amount) : 0) + part),
    });
  }
  return [...byClass.values()];
}

function estimate(
  fixture: ShopFixture,
  body: {
    items: { variantId: string; quantity: number; modifiers?: ModifierChoice[] }[];
    locationId?: number;
  },
): DeliveryEstimate {
  const counted: { tax: ProductFixture['tax']; total: number; row: ProductFixture }[] = [];
  const lines = body.items.map((item): EstimateLine => {
    const found = findVariant(fixture, item.variantId);
    if (!found) {
      return {
        variantId: item.variantId,
        onSale: false,
        price: null,
        stockState: null,
        available: false,
        itemTotal: null,
        advance: null,
        paymentPolicy: null,
        choicesFit: true,
      };
    }
    const { row, variant } = found;
    const available = variant.stockState !== StockState.Out;
    const total = unitOf(row, variant.price, item.modifiers) * item.quantity;
    if (available) counted.push({ tax: row.tax, total, row });
    return {
      variantId: item.variantId,
      onSale: true,
      price: variant.price,
      stockState: variant.stockState,
      available,
      itemTotal: available ? money(total) : null,
      advance: available ? (row.product.advanceAmount ?? '0.00') : null,
      paymentPolicy: row.product.paymentPolicy,
      choicesFit: chosen(row, item.modifiers).fits,
    };
  });
  const subtotal = money(counted.reduce((sum, line) => sum + line.total, 0));
  if (counted.length === 0) {
    return {
      lines,
      subtotal,
      zone: null,
      deliveryCharge: null,
      range: null,
      deliverable: false,
      notDeliveredHere: [],
      taxes: [],
    };
  }
  const zones = fixture.info.deliveryZones;
  const reaches = (zoneId: string) =>
    counted.filter(
      ({ row }) =>
        row.product.deliveryZoneIds.length > 0 && !row.product.deliveryZoneIds.includes(zoneId),
    );
  const taxes = taxesOf(counted);
  if (body.locationId !== undefined) {
    const zone = zones.find((row) => row.id === fixture.thanaZones[body.locationId ?? 0]);
    if (!zone) throw new Error(`no zone for thana ${String(body.locationId)}`);
    const away = reaches(zone.id).map(({ row }) => row.product.name);
    return {
      lines,
      subtotal,
      zone,
      deliveryCharge: zone.charge,
      range: null,
      deliverable: !zone.noDelivery && away.length === 0,
      notDeliveredHere: away,
      taxes,
    };
  }
  const charges = zones
    .filter((zone) => !zone.noDelivery && reaches(zone.id).length === 0)
    .map((zone) => Number(zone.charge))
    .sort((a, b) => a - b);
  const [from] = charges;
  const to = charges.at(-1);
  return {
    lines,
    subtotal,
    zone: null,
    deliveryCharge: null,
    range: from !== undefined && to !== undefined ? { from: money(from), to: money(to) } : null,
    deliverable: charges.length > 0,
    notDeliveredHere: [],
    taxes,
  };
}

interface OrderBody {
  customerName?: string;
  phone?: string;
  locationId?: number;
  deliveryAddress?: string;
  items: OrderItemInput[];
}

/** The order as tracking reads it, from what was sent. */
function trackedFrom(fixture: ShopFixture, body: OrderBody): TrackedOrder {
  const items = body.items.flatMap((item) => {
    const found = findVariant(fixture, item.variantId);
    if (!found) return [];
    const { row, variant } = found;
    const unit = unitOf(row, variant.price, item.modifiers);
    return [
      {
        variantId: item.variantId,
        productName: row.product.name,
        attributes: row.product.options.flatMap((option) => {
          const value = option.values.find((each) => variant.optionIds.includes(each.id));
          return value ? [{ name: option.name, value: value.value, variantDefining: true }] : [];
        }),
        quantity: item.quantity.toFixed(3),
        stockUnit: row.product.stockUnit,
        unitPrice: money(unit),
        itemTotal: money(unit * item.quantity),
        modifiers: chosen(row, item.modifiers).options.map((option) => ({
          groupName: option.group,
          optionName: option.name,
          priceChange: option.priceChange,
        })),
        captured: (item.captured ?? []).map((answer) => ({
          name:
            row.product.asked.find((each) => each.attributeId === answer.attributeId)?.name ?? '',
          value: answer.value,
        })),
        components: (row.product.combo?.parts ?? []).map((part) => ({
          productName: part.productName,
          attributes: [],
          quantity: part.quantity,
        })),
      },
    ];
  });
  const subtotal = items.reduce((sum, item) => sum + Number(item.itemTotal), 0);
  const zone = fixture.info.deliveryZones.find(
    (row) => row.id === fixture.thanaZones[body.locationId ?? 0],
  );
  const delivery = Number(zone?.charge ?? 0);
  const grandTotal = money(subtotal + delivery);
  const taxed = body.items.flatMap((item, index) => {
    const found = findVariant(fixture, item.variantId);
    return found ? [{ tax: found.row.tax, total: Number(items[index]?.itemTotal ?? 0) }] : [];
  });
  return {
    orderNumber: fixture.orderNumber,
    trackingId: fixture.trackingId,
    status: OrderStatus.Pending,
    timeline: [{ step: 'placed', at: new Date().toISOString() }],
    items,
    subtotal: money(subtotal),
    deliveryCharge: money(delivery),
    discount: '0.00',
    grandTotal,
    codAmount: grandTotal,
    taxes: taxesOf(taxed),
    due: grandTotal,
    courier: null,
  };
}

function place(
  state: ShopState,
  request: IncomingMessage,
  response: ServerResponse,
  body: OrderBody,
): void {
  const { fixture } = state;
  state.orderRequests += 1;
  const key = request.headers['idempotency-key'];
  if (typeof key !== 'string' || key === '') {
    fail(response, 400, 'validation_error', {});
    return;
  }
  const hash = JSON.stringify(body);
  const held = state.placedByKey.get(key);
  if (held) {
    if (held.hash !== hash) {
      fail(response, 409, 'idempotency_conflict');
      return;
    }
    response.setHeader('Idempotent-Replay', 'true');
    send(response, 201, held.placed);
    return;
  }
  const next = fixture.nextOrders.shift();
  if (next && 'refuse' in next) {
    fail(response, next.refuse.status, next.refuse.code, next.refuse.details);
    return;
  }
  const problems: { field: string; problem: string }[] = [];
  if (!body.customerName) problems.push({ field: 'customerName', problem: 'required' });
  if (!/^(\+?88)?01[3-9]\d{8}$/.test((body.phone ?? '').replace(/[\s-]/g, ''))) {
    problems.push({ field: 'phone', problem: 'invalid_format' });
  }
  if (!body.deliveryAddress) problems.push({ field: 'deliveryAddress', problem: 'required' });
  if (problems.length > 0) {
    fail(response, 422, 'validation_error', { fields: problems });
    return;
  }
  const tracked = trackedFrom(fixture, body);
  const placed = {
    orderNumber: tracked.orderNumber,
    trackingId: tracked.trackingId,
    status: tracked.status,
    createdAt: new Date().toISOString(),
    items: tracked.items,
    subtotal: tracked.subtotal,
    deliveryCharge: tracked.deliveryCharge,
    discount: tracked.discount,
    grandTotal: tracked.grandTotal,
    codAmount: tracked.codAmount,
    taxes: tracked.taxes,
    purchaseEventId: `purchase.${tracked.trackingId}`,
    payment: null,
  };
  const commit = () => {
    state.placedByKey.set(key, { hash, placed });
    state.orders.push({
      key,
      body: body as unknown as Record<string, unknown>,
      trackingId: tracked.trackingId,
    });
    fixture.tracked[tracked.trackingId] = tracked;
  };
  if (next && 'drop' in next) {
    if (next.drop.placed) commit();
    request.socket.destroy();
    return;
  }
  commit();
  send(response, 201, placed);
}

const textOf = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const onlyDigits = (phone: unknown) => textOf(phone).replace(/\D/g, '');
const WRONG_TRIES_LOCK = 5;
const ORDERS_PAGE = 20;
const ADDRESSES_MAX = 10;

function signedInAnswer(state: ShopState, phone: string) {
  const shopper = state.fixture.shoppers.find((row) => row.phone === phone);
  if (!shopper) throw new Error(`no shopper ${phone}`);
  const token = randomUUID();
  state.tokens.set(token, phone);
  return {
    token,
    expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    shopper: viewOf(shopper),
  };
}

function viewOf(shopper: ShopFixture['shoppers'][number]) {
  return {
    id: shopper.phone,
    name: shopper.name,
    phone: shopper.phone,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function locationOf(fixture: ShopFixture, locationId: number) {
  for (const zilla of fixture.locations.zillas) {
    const thana = zilla.thanas.find((row) => row.id === locationId);
    if (thana) return { ...thana, zillaId: zilla.id };
  }
  return null;
}

/** The shopper's side of the public API (CUS-03 to CUS-06, ORD-18), by the server's rules as far as a page shows them. */
async function shopperApi(
  state: ShopState,
  path: string,
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const { fixture } = state;
  const method = request.method ?? 'GET';
  const body = (method === 'POST' || method === 'PATCH' ? await readBody(request) : null) as Record<
    string,
    unknown
  > | null;
  if (path === 'code' && method === 'POST') {
    state.shopperRequests += 1;
    const refusal = fixture.nextCodes.shift();
    if (refusal) {
      fail(response, refusal.status, refusal.code);
      return;
    }
    if (fixture.shoppers.some((row) => row.phone === onlyDigits(body?.['phone']))) {
      fail(response, 409, 'conflict');
      return;
    }
    send(response, 200, {
      expiresInSeconds: 300,
      resendAfterSeconds: fixture.resendAfterSeconds,
    });
    return;
  }
  if (path === 'signup' && method === 'POST') {
    state.shopperRequests += 1;
    const code = body?.['code'];
    if (code === '000000') {
      fail(response, 422, 'validation_error', {
        fields: [{ field: 'code', problem: 'expired' }],
      });
      return;
    }
    if (code === '999999') {
      fail(response, 429, 'rate_limited');
      return;
    }
    if (code !== CODE) {
      fail(response, 422, 'validation_error', {
        fields: [{ field: 'code', problem: 'incorrect' }],
      });
      return;
    }
    const phone = onlyDigits(body?.['phone']);
    fixture.shoppers.push({
      phone,
      password: textOf(body?.['password']),
      name: textOf(body?.['name']),
      addresses: [],
      orders: [],
    });
    send(response, 201, signedInAnswer(state, phone));
    return;
  }
  if (path === 'signin' && method === 'POST') {
    state.shopperRequests += 1;
    const phone = onlyDigits(body?.['phone']);
    const tries = state.wrongTries.get(phone) ?? 0;
    if (tries >= WRONG_TRIES_LOCK) {
      fail(response, 429, 'rate_limited');
      return;
    }
    const shopper = fixture.shoppers.find((row) => row.phone === phone);
    if (!shopper || shopper.password !== body?.['password']) {
      state.wrongTries.set(phone, tries + 1);
      fail(response, 401, 'unauthenticated');
      return;
    }
    send(response, 200, signedInAnswer(state, phone));
    return;
  }
  const header = request.headers['x-shopper-token'];
  const token = typeof header === 'string' ? header : '';
  const shopper = fixture.shoppers.find((row) => row.phone === state.tokens.get(token));
  if (!shopper) {
    fail(response, 401, 'unauthenticated');
    return;
  }
  if (path === 'signout' && method === 'POST') {
    state.tokens.delete(token);
    send(response, 200, { ok: true });
    return;
  }
  if (path === 'me') {
    if (method === 'PATCH') shopper.name = textOf(body?.['name']);
    send(response, 200, viewOf(shopper));
    return;
  }
  if (path === 'password' && method === 'POST') {
    if (body?.['currentPassword'] !== shopper.password) {
      fail(response, 422, 'validation_error', {
        fields: [{ field: 'currentPassword', problem: 'incorrect' }],
      });
      return;
    }
    shopper.password = textOf(body['newPassword']);
    for (const [held, phone] of state.tokens) {
      if (phone === shopper.phone && held !== token) state.tokens.delete(held);
    }
    send(response, 200, { ok: true });
    return;
  }
  if (path === 'orders') {
    const page = Number(url.searchParams.get('page') ?? 1);
    const total = shopper.orders.length;
    send(response, 200, {
      orders: shopper.orders.slice((page - 1) * ORDERS_PAGE, page * ORDERS_PAGE),
      page,
      limit: ORDERS_PAGE,
      total,
      pages: Math.ceil(total / ORDERS_PAGE),
    });
    return;
  }
  const defaultOne = (makeDefault: unknown, id: string) => {
    if (makeDefault !== true) return;
    for (const row of shopper.addresses) row.isDefault = row.id === id;
  };
  const addresses = () => ({
    addresses: [...shopper.addresses].sort((a, b) => Number(b.isDefault) - Number(a.isDefault)),
  });
  if (path === 'addresses') {
    if (method === 'POST') {
      if (shopper.addresses.length >= ADDRESSES_MAX) {
        fail(response, 409, 'conflict');
        return;
      }
      const id = randomUUID();
      shopper.addresses.push({
        id,
        label: textOf(body?.['label']),
        location: locationOf(fixture, Number(body?.['locationId'])),
        deliveryAddress: textOf(body?.['deliveryAddress']),
        isDefault: shopper.addresses.length === 0,
      });
      defaultOne(body?.['isDefault'], id);
      send(response, 201, addresses());
      return;
    }
    send(response, 200, addresses());
    return;
  }
  const one = /^addresses\/(.+)$/.exec(path)?.[1];
  const address = shopper.addresses.find((row) => row.id === one);
  if (!address) {
    fail(response, 404, 'not_found');
    return;
  }
  if (method === 'DELETE') {
    shopper.addresses = shopper.addresses.filter((row) => row !== address);
    const [next] = shopper.addresses;
    if (address.isDefault && next) next.isDefault = true;
    send(response, 200, addresses());
    return;
  }
  address.label = textOf(body?.['label'], address.label);
  address.deliveryAddress = textOf(body?.['deliveryAddress'], address.deliveryAddress);
  if (body?.['locationId'] !== undefined) {
    address.location = locationOf(fixture, Number(body['locationId']));
  }
  defaultOne(body?.['isDefault'], address.id);
  send(response, 200, addresses());
}

function shopOfKey(request: IncomingMessage): ShopState | null {
  const bearer = /^Bearer key-(.+)$/.exec(request.headers.authorization ?? '');
  return bearer?.[1] ? (shops.get(bearer[1]) ?? null) : null;
}

async function publicApi(
  state: ShopState,
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const { fixture } = state;
  const path = url.pathname;
  const shopperPath = /^\/v1\/shopper\/(.+)$/.exec(path)?.[1];
  if (shopperPath) {
    await shopperApi(state, shopperPath, url, request, response);
    return;
  }
  if (path === '/v1/shop') {
    send(response, 200, fixture.info);
    return;
  }
  if (path === '/v1/catalogue/categories') {
    send(response, 200, { categories: fixture.categories });
    return;
  }
  if (path === '/v1/locations') {
    send(response, 200, fixture.locations);
    return;
  }
  if (path === '/v1/catalogue/products') {
    const limit = Number(url.searchParams.get('limit') ?? 24);
    const category = url.searchParams.get('category');
    const rows = fixture.products.filter(
      (row) => category === null || row.product.categoryIds.includes(category),
    );
    send(response, 200, {
      products: rows.slice(0, limit).map((row) => row.card),
      nextCursor: null,
    });
    return;
  }
  const product = /^\/v1\/catalogue\/products\/(.+)$/.exec(path);
  if (product?.[1]) {
    const slug = decodeURIComponent(product[1]);
    const current = fixture.moved[slug] ?? slug;
    const row = fixture.products.find((each) => each.product.slug === current);
    if (!row) {
      fail(response, 404, 'not_found');
      return;
    }
    send(response, 200, row.product);
    return;
  }
  if (path === '/v1/delivery-estimate' && request.method === 'POST') {
    const body = (await readBody(request)) as Parameters<typeof estimate>[1];
    send(response, 200, estimate(fixture, body));
    return;
  }
  if (path === '/v1/orders' && request.method === 'POST') {
    const body = (await readBody(request)) as OrderBody;
    place(state, request, response, body);
    return;
  }
  const tracking = /^\/v1\/track\/(.+)$/.exec(path);
  if (tracking?.[1]) {
    const order = fixture.tracked[decodeURIComponent(tracking[1])];
    if (!order) {
      fail(response, 404, 'not_found');
      return;
    }
    send(response, 200, order);
    return;
  }
  fail(response, 404, 'not_found');
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', `http://localhost:${String(MOCK_PORT)}`);
  const path = url.pathname;
  if (path === '/__shop' && request.method === 'POST') {
    const fixture = (await readBody(request)) as ShopFixture;
    shops.set(fixture.slug, {
      fixture,
      orders: [],
      placedByKey: new Map(),
      orderRequests: 0,
      tokens: new Map(),
      wrongTries: new Map(),
      shopperRequests: 0,
    });
    send(response, 201, { slug: fixture.slug });
    return;
  }
  const orders = /^\/__orders\/(.+)$/.exec(path);
  if (orders?.[1]) {
    const state = shops.get(orders[1]);
    send(response, 200, {
      orders: state?.orders ?? [],
      requests: state?.orderRequests ?? 0,
      shopperRequests: state?.shopperRequests ?? 0,
      shoppers: state?.fixture.shoppers ?? [],
    });
    return;
  }
  if (path === '/api/v1/internal/storefront/context') {
    const host = url.searchParams.get('host') ?? '';
    const state = shops.get(host.split('.')[0] ?? '');
    if (!state) {
      send(response, 200, { outcome: 'not_found', shop: null });
      return;
    }
    if (state.fixture.outcome === 'closed') {
      send(response, 200, { outcome: 'closed', shop: null });
      return;
    }
    const origin = `http://${state.fixture.slug}.localhost:${String(STOREFRONT_PORT)}`;
    send(response, 200, {
      outcome: 'open',
      shop: {
        slug: state.fixture.slug,
        storefrontEnabled: state.fixture.storefrontEnabled,
        key: `key-${state.fixture.slug}`,
        origin,
        mainHost: null,
        publicOrigin: origin,
      },
    });
    return;
  }
  const state = shopOfKey(request);
  if (!state) {
    fail(response, 401, 'unauthenticated');
    return;
  }
  return publicApi(state, url, request, response);
}

export function startMockServer(): Promise<Server> {
  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      console.error(error);
      fail(response, 500, 'internal_error');
    });
  });
  return new Promise((resolve) => {
    server.listen(MOCK_PORT, '127.0.0.1', () => {
      resolve(server);
    });
  });
}
