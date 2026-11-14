// The load test's stand-in for every outside service the server calls (Phase 9 Slice 9.10, read 2026-11-14: one
// stand-in answers for BulkSMSBD, the three couriers, bKash, Resend and Gemini, each with a realistic delay, so no SMS is
// sent and no provider's account is touched). The load setup points each provider's base-URL setting
// (apps/server/src/config/env.ts) at its own path here:
//
//   BULKSMSBD_BASE_URL                       https://outside:8443/bulksmsbd/api
//   STEADFAST_API_URL                        https://outside:8443/steadfast/api/v1
//   PATHAO_API_URL                           https://outside:8443/pathao/aladdin/api/v1
//   REDX_API_URL                             https://outside:8443/redx/v1.0.0-beta
//   BKASH_SANDBOX_URL, BKASH_PRODUCTION_URL  https://outside:8443/bkash/v2
//   RESEND_BASE_URL                          https://outside:8443/resend
//   GEMINI_BASE_URL                          https://outside:8443/gemini/v1beta
//
// Each provider answers what the server's adapter reads on success, as the suite's in-process fakes do
// (apps/server/test/support/fake-*.ts), and keeps in memory what was made, so a later lookup finds it. Missing
// credentials are refused in the provider's own words, so a load setup that sends none shows up; their values are never
// checked. Every provider call waits its provider's delay, give or take 30%.
//
// Its own routes, for the load scripts inside the Docker network, on HTTPS and on plain HTTP at CODES_PORT (k6 can't skip
// the certificate check for one request, and the run mustn't skip it for all):
//   GET /codes?phone=   the newest SMS to a number (its last 10 digits), with the first run of 4 to 8 digits in it
//   GET /stats          calls by provider and route, SMS sent, unknown paths
//   GET /health         200
//
// HTTPS from the certificate start.sh makes; BulkSMSBD, Resend and Gemini refuse any other address. Node's own modules,
// nothing installed. It logs one line at start and one for each unknown path, and never a request's body: bodies carry
// the test's credentials.
//
// Settings: PORT (8443), CODES_PORT (8081), HOST (0.0.0.0), CERT_DIR (/certs, holding server.pem and server.key),
// LOCATIONS_FILE (locations.json beside this file: Lytro's zillas and thanas, for RedX's areas), DELAY_MS_SMS (300),
// DELAY_MS_COURIER (400), DELAY_MS_BKASH (500), DELAY_MS_RESEND (200), DELAY_MS_GEMINI (1500).

import { Buffer } from 'node:buffer';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, URL, URLSearchParams } from 'node:url';

const JITTER = 0.3;
const BODY_MAX_BYTES = 1024 * 1024;
// Past this, the oldest of anything kept is forgotten, so a long run's memory stays flat.
const KEPT_MAX = 200_000;
const UNKNOWN_PATHS_MAX = 500;
// Pathao's tokens, as its fake has them: 90 days.
const PATHAO_TOKEN_SECONDS = 90 * 24 * 60 * 60;
// What the stand-in says paid: bKash's payer, and the number in a reading of a message that has none.
const PAYER_ACCOUNT = '01770618575';
const BANGLA_ZERO = 0x09e6;
// stand-in-address-reader.ts: a Bangladeshi mobile as written, an optional +88, spaces or dashes inside.
const WRITTEN_MOBILE = /(?:\+?88)?0\s*1[3-9](?:[\s-]*\d){8}/;
// When the locations file can't be read: a few of Dhaka's thanas.
const FALLBACK_AREAS = ['Mirpur', 'Dhanmondi', 'Gulshan', 'Mohammadpur', 'Uttara', 'Motijheel'].map(
  (name) => ({ name, district: 'Dhaka' }),
);

/** The settings, read once at start; a wrong one stops it, naming the setting. */
function settingsOf(env) {
  const whole = (name, fallback, max = Number.MAX_SAFE_INTEGER) => {
    const raw = env[name];
    if (raw === undefined || raw.trim() === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0 || value > max) {
      throw new Error(`${name} must be a whole number from 0 to ${String(max)}`);
    }
    return value;
  };
  const here = dirname(fileURLToPath(import.meta.url));
  return {
    port: whole('PORT', 8443, 65_535),
    codesPort: whole('CODES_PORT', 8081, 65_535),
    host: env.HOST?.trim() || '0.0.0.0',
    certDir: env.CERT_DIR?.trim() || '/certs',
    locationsFile: env.LOCATIONS_FILE?.trim() || join(here, 'locations.json'),
    delays: {
      sms: whole('DELAY_MS_SMS', 300),
      courier: whole('DELAY_MS_COURIER', 400),
      bkash: whole('DELAY_MS_BKASH', 500),
      resend: whole('DELAY_MS_RESEND', 200),
      gemini: whole('DELAY_MS_GEMINI', 1500),
    },
  };
}

function log(line) {
  process.stdout.write(`outside: ${line}\n`);
}

function json(status, body, headers = {}) {
  return { status, body, headers };
}

/** A field's value as text, trimmed; '' for anything else. */
function text(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' ? value.trim() : '';
}

function headerOf(request, name) {
  const value = request.headers[name];
  return text(Array.isArray(value) ? value[0] : value);
}

function hex(bytes) {
  return randomBytes(bytes).toString('hex');
}

/** Now as the couriers write a time: Dhaka's, with no zone. */
function dhakaNow() {
  return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

/** A phone however it was written, by its last 10 digits; null if it has fewer. */
function lastTen(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/** The first run of 4 to 8 digits standing alone, so a phone number in the text is never taken for a code. */
function codeIn(words) {
  return /(?<!\d)\d{4,8}(?!\d)/.exec(words)?.[0] ?? null;
}

function decoded(part) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/** A map that forgets its oldest entry past `limit`; setting a key again makes it the newest. */
class BoundedMap extends Map {
  constructor(limit) {
    super();
    this.limit = limit;
  }

  set(key, value) {
    this.delete(key);
    super.set(key, value);
    if (this.size > this.limit) this.delete(this.keys().next().value);
    return this;
  }
}

/** Each provider's delay, give or take 30%. */
class Delays {
  constructor(base, random = Math.random) {
    this.base = base;
    this.random = random;
  }

  wait(kind) {
    const base = this.base[kind] ?? 0;
    if (base === 0) return Promise.resolve();
    return sleep(Math.round(base * (1 - JITTER + 2 * JITTER * this.random())));
  }
}

class Stats {
  constructor() {
    this.since = new Date().toISOString();
    this.calls = {};
    this.smsSent = 0;
    this.unknownCalls = 0;
    this.unknownPaths = new Map();
    this.unknownOverflowLogged = false;
  }

  count(provider, route) {
    const own = (this.calls[provider] ??= {});
    own[route] = (own[route] ?? 0) + 1;
  }

  /** Counts an unknown path; answers the line to log the first time it is seen, null after. */
  unknown(method, path) {
    this.unknownCalls += 1;
    const key = `${method} ${path}`;
    const seen = this.unknownPaths.get(key);
    if (seen !== undefined) {
      this.unknownPaths.set(key, seen + 1);
      return null;
    }
    if (this.unknownPaths.size >= UNKNOWN_PATHS_MAX) {
      if (this.unknownOverflowLogged) return null;
      this.unknownOverflowLogged = true;
      return `over ${String(UNKNOWN_PATHS_MAX)} unknown paths; the rest are only counted`;
    }
    this.unknownPaths.set(key, 1);
    return `no route for ${key}`;
  }

  toJSON() {
    return {
      since: this.since,
      calls: this.calls,
      smsSent: this.smsSent,
      unknown: { calls: this.unknownCalls, paths: Object.fromEntries(this.unknownPaths) },
    };
  }
}

/** The newest SMS each number got, by its last 10 digits. */
class SmsInbox {
  constructor(limit) {
    this.byPhone = new BoundedMap(limit);
  }

  keep(phone, words) {
    const key = lastTen(phone);
    if (key !== null) this.byPhone.set(key, { phone, text: words });
  }

  newest(phone) {
    const key = lastTen(phone);
    return key === null ? undefined : this.byPhone.get(key);
  }
}

/**
 * bulksmsbd.provider.ts: a form of api_key, type, number (8801XXXXXXXXX), senderid and message posted to /smsapi;
 * response_code 202 is sent, with its message_id, and any other code is a refusal.
 */
class BulkSmsBd {
  constructor(inbox, stats) {
    this.name = 'bulksmsbd';
    this.prefix = '/bulksmsbd/api';
    this.delay = 'sms';
    this.inbox = inbox;
    this.stats = stats;
    this.nextId = 1;
    this.routes = [
      { method: 'POST', path: /^\/smsapi$/, route: 'POST /smsapi', handle: (r) => this.send(r) },
    ];
  }

  send(request) {
    const form = request.body ?? {};
    const numbers = text(form.number)
      .split(',')
      .map((each) => each.trim())
      .filter((each) => each !== '');
    const message = typeof form.message === 'string' ? form.message : '';
    if (!text(form.api_key) || !text(form.senderid) || numbers.length === 0 || !message.trim()) {
      return json(200, {
        response_code: 1003,
        success_message: '',
        error_message: 'Please provide all the required fields',
      });
    }
    if (!numbers.every((each) => /^(?:88)?01[3-9]\d{8}$/.test(each))) {
      return json(200, {
        response_code: 1001,
        success_message: '',
        error_message: 'Invalid Number',
      });
    }
    for (const number of numbers) {
      this.inbox.keep(number, message);
      this.stats.smsSent += 1;
    }
    const messageId = this.nextId;
    this.nextId += 1;
    return json(200, {
      response_code: 202,
      message_id: messageId,
      success_message: 'SMS Submitted Successfully',
      error_message: '',
    });
  }
}

/**
 * steadfast-adapter.ts: Api-Key and Secret-Key on every call; its balance (the connection's test), a booking that answers
 * a consignment, status by consignment or by our invoice, its fraud check, and its payouts. A repeated invoice is refused,
 * as fake-steadfast.ts has it, which is what lets the server ask by invoice after a lost answer.
 */
class Steadfast {
  constructor() {
    this.name = 'steadfast';
    this.prefix = '/steadfast/api/v1';
    this.delay = 'courier';
    this.byId = new BoundedMap(KEPT_MAX);
    this.byInvoice = new BoundedMap(KEPT_MAX);
    this.nextId = 1424107;
    this.routes = [
      {
        method: 'GET',
        path: /^\/get_balance$/,
        route: 'GET /get_balance',
        handle: () => json(200, { status: 200, current_balance: 0 }),
      },
      {
        method: 'POST',
        path: /^\/create_order$/,
        route: 'POST /create_order',
        handle: (r) => this.createOrder(r),
      },
      {
        method: 'GET',
        path: /^\/status_by_cid\/([^/]+)$/,
        route: 'GET /status_by_cid/:id',
        handle: (r, id) => this.status(r, this.byId.get(id)),
      },
      {
        method: 'GET',
        path: /^\/status_by_invoice\/([^/]+)$/,
        route: 'GET /status_by_invoice/:invoice',
        handle: (r, invoice) => this.status(r, this.byInvoice.get(this.invoiceKey(r, invoice))),
      },
      {
        method: 'GET',
        path: /^\/fraud_check\/score\/([^/]+)$/,
        route: 'GET /fraud_check/score/:phone',
        handle: (r, phone) => this.fraudScore(phone),
      },
      {
        method: 'GET',
        path: /^\/payments$/,
        route: 'GET /payments',
        handle: () =>
          json(200, {
            status: 200,
            alertClass: 'success',
            message: 'Payments retrieved successfully.',
            payments: [],
          }),
      },
      {
        method: 'GET',
        path: /^\/payments\/([^/]+)$/,
        route: 'GET /payments/:id',
        handle: () => json(404, { status: 404, message: 'Payment not found.' }),
      },
    ];
  }

  refuse(request) {
    return headerOf(request, 'api-key') && headerOf(request, 'secret-key')
      ? null
      : json(401, { status: 401, message: 'Unauthorized.' });
  }

  invoiceKey(request, invoice) {
    return `${headerOf(request, 'api-key')}\n${invoice}`;
  }

  createOrder(request) {
    const body = request.body ?? {};
    const invoice = text(body.invoice);
    const errors = {};
    for (const field of ['invoice', 'recipient_name', 'recipient_phone', 'recipient_address']) {
      if (!text(body[field]))
        errors[field] = [`The ${field.replace(/_/g, ' ')} field is required.`];
    }
    if (typeof body.cod_amount !== 'number' || body.cod_amount < 0) {
      errors.cod_amount = ['The cod amount must be a number.'];
    }
    if (invoice && this.byInvoice.has(this.invoiceKey(request, invoice))) {
      errors.invoice = ['The invoice has already been taken.'];
    }
    if (Object.keys(errors).length > 0) return json(400, { status: 400, errors });
    const consignmentId = this.nextId;
    this.nextId += 1;
    const made = {
      apiKey: headerOf(request, 'api-key'),
      consignment_id: consignmentId,
      invoice,
      tracking_code: `TRK${String(consignmentId)}`,
      status: 'in_review',
    };
    this.byId.set(String(consignmentId), made);
    this.byInvoice.set(this.invoiceKey(request, invoice), made);
    return json(200, {
      status: 200,
      message: 'Consignment has been created successfully.',
      consignment: {
        consignment_id: consignmentId,
        invoice,
        tracking_code: made.tracking_code,
        recipient_name: body.recipient_name,
        recipient_phone: body.recipient_phone,
        recipient_address: body.recipient_address,
        cod_amount: body.cod_amount,
        status: made.status,
        note: body.note ?? null,
        created_at: dhakaNow(),
        updated_at: dhakaNow(),
      },
    });
  }

  /** Its guide: a parcel on another profile answers 401, as fake-steadfast.ts's `otherProfile`. */
  status(request, parcel) {
    if (parcel === undefined) return json(404, { status: 404, message: 'Consignment not found.' });
    if (parcel.apiKey !== headerOf(request, 'api-key')) {
      return json(401, { status: 401, message: 'Unauthorized.' });
    }
    return json(200, { status: 200, delivery_status: parcel.status });
  }

  /** Its live answer for a phone it has no record of (fake-steadfast.ts's NO_FRAUD_RECORD). */
  fraudScore(phone) {
    return json(200, {
      status: 200,
      phone,
      score: null,
      level: null,
      reasons: [],
      scoring_disabled: true,
      delivered_count: null,
      cancelled_count: null,
      delivery_ratio: null,
      cancellation_ratio: null,
      return_ratio: null,
      volume_band: 'none',
      volume_range: null,
      total_reports: 0,
      doubtful_reports: false,
      fraud_categories: [],
    });
  }
}

/**
 * pathao-adapter.ts: tokens from /issue-token, by password or by refresh token; a Bearer token on every other call; its
 * pickup stores (the connection's test too), a booking that names one of them and answers a consignment, and a
 * parcel's status by consignment. Its checks on a booking are fake-pathao.ts's: whole numbers, a weight, a known store.
 */
class Pathao {
  constructor() {
    this.name = 'pathao';
    this.prefix = '/pathao/aladdin/api/v1';
    this.delay = 'courier';
    this.parcels = new BoundedMap(KEPT_MAX);
    this.nextParcel = 1;
    this.stores = [
      {
        store_id: 2,
        store_name: 'Mirpur warehouse',
        store_address: 'House 1, Mirpur, Dhaka',
        is_active: 1,
        city_id: 1,
        zone_id: 1,
        hub_id: 1,
        is_default_store: true,
        is_default_return_store: true,
      },
    ];
    this.routes = [
      {
        method: 'POST',
        path: /^\/issue-token$/,
        route: 'POST /issue-token',
        open: true,
        handle: (r) => this.issue(r),
      },
      { method: 'GET', path: /^\/stores$/, route: 'GET /stores', handle: () => this.listStores() },
      {
        method: 'POST',
        path: /^\/orders$/,
        route: 'POST /orders',
        handle: (r) => this.createOrder(r),
      },
      {
        method: 'GET',
        path: /^\/orders\/([^/]+)\/info$/,
        route: 'GET /orders/:id/info',
        handle: (r, id) => this.info(id),
      },
    ];
  }

  refuse(request) {
    const bearer = headerOf(request, 'authorization').replace(/^Bearer\s*/i, '');
    return bearer
      ? null
      : json(401, {
          message: 'Unauthorized User',
          type: 'error',
          error: { source: 'verify-auth-token', description: 'access token is invalid' },
        });
  }

  issue(request) {
    const body = request.body ?? {};
    const refused = json(400, {
      message: 'The user credentials were incorrect',
      type: 'error',
      code: 400,
    });
    if (!text(body.client_id) || !text(body.client_secret)) return refused;
    if (body.grant_type === 'password') {
      if (!text(body.username) || !text(body.password)) return refused;
    } else if (body.grant_type === 'refresh_token') {
      if (!text(body.refresh_token)) return refused;
    } else {
      return refused;
    }
    return json(200, {
      token_type: 'Bearer',
      expires_in: PATHAO_TOKEN_SECONDS,
      access_token: `standin-pathao-access-${hex(16)}`,
      refresh_token: `standin-pathao-refresh-${hex(16)}`,
    });
  }

  listStores() {
    return json(200, {
      message: 'Store list fetched.',
      type: 'success',
      code: 200,
      data: { data: this.stores, total: this.stores.length, current_page: 1, per_page: 1000 },
    });
  }

  createOrder(request) {
    const body = request.body ?? {};
    const errors = {};
    for (const field of [
      'merchant_order_id',
      'recipient_name',
      'recipient_phone',
      'recipient_address',
    ]) {
      if (!text(body[field]))
        errors[field] = [`The ${field.replace(/_/g, ' ')} field is required.`];
    }
    if (!Number.isInteger(body.amount_to_collect)) {
      errors.amount_to_collect = ['The amount to collect must be an integer.'];
    }
    if (!Number.isInteger(body.item_quantity)) {
      errors.item_quantity = ['The item quantity must be an integer.'];
    }
    if (body.item_weight === undefined) errors.item_weight = ['The item weight field is required.'];
    if (!this.stores.some((store) => store.store_id === body.store_id)) {
      errors.store_id = ['Wrong Store selected'];
    }
    if (Object.keys(errors).length > 0) {
      return json(422, {
        message: 'Please fix the given errors',
        type: 'error',
        code: 422,
        errors,
      });
    }
    const consignmentId = `DL${String(this.nextParcel).padStart(7, '0')}LT`;
    this.nextParcel += 1;
    this.parcels.set(consignmentId, {
      merchantOrderId: text(body.merchant_order_id),
      status: 'Pending',
      updatedAt: dhakaNow(),
    });
    return json(200, {
      message: 'Order Created Successfully',
      type: 'success',
      code: 200,
      data: {
        consignment_id: consignmentId,
        merchant_order_id: body.merchant_order_id,
        order_status: 'Pending',
        delivery_fee: 60,
      },
    });
  }

  info(consignmentId) {
    const parcel = this.parcels.get(consignmentId);
    if (parcel === undefined) {
      return json(404, {
        message: 'order not found',
        type: 'error',
        code: 404,
        errors: 'order not found',
      });
    }
    return json(200, {
      type: 'success',
      code: 200,
      data: {
        consignment_id: consignmentId,
        merchant_order_id: parcel.merchantOrderId,
        invoice_id: null,
        order_status: parcel.status,
        order_status_slug: parcel.status,
        payment_status: '',
        updated_at: parcel.updatedAt,
      },
    });
  }
}

/**
 * redx-adapter.ts: one token in `API-ACCESS-TOKEN: Bearer ...`; its area list (read with Lytro's own token), pickup
 * stores (the connection's test too), a booking that needs one of its areas and a declared value and answers a tracking
 * id, a parcel's status and how it was delivered, and a cancel. Its areas are named after Lytro's thanas, one each, so
 * every order's place has an area of its own name (courier-area-list.ts picks it with no staff choice).
 */
class Redx {
  constructor(areas) {
    this.name = 'redx';
    this.prefix = '/redx/v1.0.0-beta';
    this.delay = 'courier';
    this.areas = areas;
    this.areaIds = new Set(areas.map((area) => area.id));
    this.parcels = new BoundedMap(KEPT_MAX);
    this.nextParcel = 1;
    this.stores = [
      {
        id: 1,
        name: 'Malibag',
        address: 'Malibagh main road',
        area_name: 'Malibag',
        area_id: 160,
        phone: '8801888999999',
      },
    ];
    this.routes = [
      {
        method: 'GET',
        path: /^\/areas$/,
        route: 'GET /areas',
        handle: () => json(200, { areas: this.areas }),
      },
      {
        method: 'GET',
        path: /^\/pickup\/stores$/,
        route: 'GET /pickup/stores',
        handle: () => json(200, { pickup_stores: this.stores }),
      },
      {
        method: 'POST',
        path: /^\/parcel$/,
        route: 'POST /parcel',
        handle: (r) => this.createParcel(r),
      },
      {
        method: 'GET',
        path: /^\/parcel\/info\/([^/]+)$/,
        route: 'GET /parcel/info/:id',
        handle: (r, id) => this.info(id),
      },
      {
        method: 'PATCH',
        path: /^\/parcels$/,
        route: 'PATCH /parcels',
        handle: (r) => this.cancel(r),
      },
    ];
  }

  refuse(request) {
    const token = headerOf(request, 'api-access-token').replace(/^Bearer\s*/i, '');
    return token ? null : json(401, { message: 'Unauthorized', status_code: 401 });
  }

  createParcel(request) {
    const body = request.body ?? {};
    const errors = [];
    for (const field of [
      'customer_name',
      'customer_phone',
      'customer_address',
      'merchant_invoice_id',
    ]) {
      if (!text(body[field])) errors.push({ [field]: `"${field}" is required` });
    }
    if (body.value === undefined) errors.push({ value: '"value" is required' });
    if (!text(body.delivery_area)) errors.push({ delivery_area: 'Delivery Area is required' });
    if (!this.areaIds.has(body.delivery_area_id)) {
      errors.push({ delivery_area_id: 'Not a valid delivery_area_id provided for delivery!' });
    }
    if (errors.length > 0) {
      return json(400, {
        message: 'Request payload contains validation errors',
        validation_errors: errors,
      });
    }
    const trackingId = `21A${String(this.nextParcel).padStart(6, '0')}LTRX`;
    this.nextParcel += 1;
    this.parcels.set(trackingId, {
      status: 'pickup-pending',
      deliveryType: 'regular',
      cash: text(body.cash_collection_amount),
      invoice: text(body.merchant_invoice_id),
    });
    return json(201, { tracking_id: trackingId });
  }

  info(trackingId) {
    const parcel = this.parcels.get(trackingId);
    if (parcel === undefined) return json(404, { message: 'Parcel not found' });
    return json(200, {
      parcel: {
        tracking_id: trackingId,
        merchant_invoice_id: parcel.invoice,
        status: parcel.status,
        delivery_type: parcel.deliveryType,
        charge: 60,
        cash_collection_amount: parcel.cash,
      },
    });
  }

  cancel(request) {
    const body = request.body ?? {};
    const parcel = this.parcels.get(text(body.entity_id));
    if (parcel === undefined) return json(400, { message: 'Parcel not found' });
    parcel.status = 'cancelled';
    return json(200, { success: true, message: 'Request Accepted' });
  }
}

/**
 * bkash-gateway.ts: Tokenized Checkout with no agreement. A token from grant-token or refresh-token (username and
 * password headers, app_key and app_secret in the body); then create, execute and query, each with the token in
 * `authorization` and the app key in `x-app-key`. A refusal carries an externalCode and HTTP 400, as fake-bkash.ts.
 *
 * Its bkashURL is a page here, GET /bkash/checkout?paymentId=, which stands for the shopper putting in their PIN: it sends
 * them to the payment's callbackURL with paymentID and status=success (or status=failure|cancel, when asked). An
 * execute is taken as after the PIN even when nobody opened the page, so a load script may go straight to the callback.
 */
class Bkash {
  constructor() {
    this.name = 'bkash';
    this.prefix = '/bkash';
    this.delay = 'bkash';
    this.payments = new BoundedMap(KEPT_MAX);
    const checkout = '/v2/tokenized-checkout';
    this.routes = [
      {
        method: 'POST',
        path: /^\/v2\/tokenized-checkout\/auth\/grant-token$/,
        route: `POST ${checkout}/auth/grant-token`,
        open: true,
        handle: (r) => this.token(r, false),
      },
      {
        method: 'POST',
        path: /^\/v2\/tokenized-checkout\/auth\/refresh-token$/,
        route: `POST ${checkout}/auth/refresh-token`,
        open: true,
        handle: (r) => this.token(r, true),
      },
      {
        method: 'POST',
        path: /^\/v2\/tokenized-checkout\/payment\/create$/,
        route: `POST ${checkout}/payment/create`,
        handle: (r) => this.create(r),
      },
      {
        method: 'POST',
        path: /^\/v2\/tokenized-checkout\/payment\/execute$/,
        route: `POST ${checkout}/payment/execute`,
        handle: (r) => this.execute(r),
      },
      {
        method: 'POST',
        path: /^\/v2\/tokenized-checkout\/query\/payment$/,
        route: `POST ${checkout}/query/payment`,
        handle: (r) => this.query(r),
      },
      {
        method: 'GET',
        path: /^\/checkout$/,
        route: 'GET /checkout',
        open: true,
        handle: (r) => this.checkoutPage(r),
      },
    ];
  }

  refuse(request) {
    return headerOf(request, 'authorization') && headerOf(request, 'x-app-key')
      ? null
      : this.refused('2079', 'Invalid token');
  }

  refused(externalCode, errorMessageEn) {
    return json(400, { externalCode, errorCode: externalCode, errorMessageEn });
  }

  token(request, refresh) {
    const body = request.body ?? {};
    if (
      !headerOf(request, 'username') ||
      !headerOf(request, 'password') ||
      !text(body.app_key) ||
      !text(body.app_secret)
    ) {
      return json(200, { statusCode: '2001', statusMessage: 'Invalid App Key' });
    }
    if (refresh && !text(body.refresh_token)) {
      return json(200, { statusCode: '2079', statusMessage: 'Invalid refresh token' });
    }
    return json(200, {
      statusCode: '0000',
      statusMessage: 'Successful',
      id_token: `standin-bkash-id-${hex(24)}`,
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: `standin-bkash-refresh-${hex(24)}`,
    });
  }

  create(request) {
    const body = request.body ?? {};
    const amount = text(body.amount);
    const callbackUrl = text(body.callbackURL);
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
      return this.refused('2008', 'Invalid amount');
    }
    if (!callbackUrl || !text(body.merchantInvoiceNumber)) {
      return this.refused('2065', 'Mandatory field missing');
    }
    const paymentId = `TR0011${hex(8).toUpperCase()}`;
    const createdAt = new Date().toISOString();
    this.payments.set(paymentId, {
      paymentId,
      appKey: headerOf(request, 'x-app-key'),
      amount,
      invoice: text(body.merchantInvoiceNumber),
      payerReference: text(body.payerReference),
      callbackUrl,
      createdAt,
      state: 'initiated',
      trxId: null,
    });
    const host = headerOf(request, 'host') || 'outside:8443';
    return json(200, {
      statusCode: '0000',
      statusMessage: 'Successful',
      // The adapter reads `paymentId` (bkash-gateway.ts initiate); bKash's own documents spell it `paymentID`.
      paymentId,
      paymentID: paymentId,
      bkashURL: `https://${host}/bkash/checkout?paymentId=${paymentId}`,
      callbackURL: callbackUrl,
      successCallbackURL: `${callbackUrl}?status=success`,
      failureCallbackURL: `${callbackUrl}?status=failure`,
      cancelledCallbackURL: `${callbackUrl}?status=cancel`,
      amount,
      intent: 'sale',
      currency: 'BDT',
      paymentCreateTime: createdAt,
      transactionStatus: 'Initiated',
      merchantInvoiceNumber: text(body.merchantInvoiceNumber),
    });
  }

  /** The payment a call names, under either spelling, and only for the app that made it (fake-bkash.ts). */
  paymentOf(request) {
    const body = request.body ?? {};
    const payment = this.payments.get(text(body.paymentId) || text(body.paymentID));
    return payment?.appKey === headerOf(request, 'x-app-key') ? payment : undefined;
  }

  execute(request) {
    const payment = this.paymentOf(request);
    if (!payment) return this.refused('2002', 'Invalid Payment ID');
    if (payment.state === 'completed') {
      return this.refused('2062', 'The payment has already been completed');
    }
    if (payment.state !== 'initiated' && payment.state !== 'authorised') {
      return this.refused('2056', 'Invalid Payment State');
    }
    payment.state = 'completed';
    payment.trxId = hex(5).toUpperCase();
    return json(200, {
      statusCode: '0000',
      statusMessage: 'Successful',
      paymentID: payment.paymentId,
      customerMsisdn: PAYER_ACCOUNT,
      payerAccount: PAYER_ACCOUNT,
      payerReference: payment.payerReference,
      paymentExecuteTime: new Date().toISOString(),
      trxID: payment.trxId,
      transactionStatus: 'Completed',
      amount: payment.amount,
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber: payment.invoice,
    });
  }

  query(request) {
    const payment = this.paymentOf(request);
    if (!payment) return this.refused('2002', 'Invalid Payment ID');
    const completed = payment.state === 'completed';
    const words = { failed: 'Failed', cancelled: 'Cancelled' };
    return json(200, {
      statusCode: '0000',
      statusMessage: 'Successful',
      paymentID: payment.paymentId,
      mode: '0011',
      paymentCreateTime: payment.createdAt,
      amount: payment.amount,
      currency: 'BDT',
      intent: 'sale',
      merchantInvoice: payment.invoice,
      transactionStatus: completed ? 'Completed' : (words[payment.state] ?? 'Initiated'),
      verificationStatus: payment.state === 'authorised' || completed ? 'Complete' : 'Incomplete',
      ...(completed ? { trxID: payment.trxId, payerAccount: PAYER_ACCOUNT } : {}),
    });
  }

  checkoutPage(request) {
    const paymentId = text(request.query.get('paymentId') ?? request.query.get('paymentID'));
    const payment = this.payments.get(paymentId);
    if (!payment) return json(404, { error: 'no such payment', paymentId });
    const asked = text(request.query.get('status')) || 'success';
    const status = ['success', 'failure', 'cancel'].includes(asked) ? asked : 'success';
    if (payment.state === 'initiated') {
      payment.state =
        status === 'success' ? 'authorised' : status === 'failure' ? 'failed' : 'cancelled';
    }
    let back;
    try {
      back = new URL(payment.callbackUrl);
    } catch {
      return json(400, { error: 'the payment has no callbackURL to return to' });
    }
    back.searchParams.set('paymentID', payment.paymentId);
    back.searchParams.set('status', status);
    back.searchParams.set('signature', hex(5));
    back.searchParams.set('apiVersion', '1.2.0-beta');
    return { status: 302, body: null, headers: { location: back.href } };
  }
}

/**
 * resend-mail.provider.ts: POST /emails with `authorization: Bearer <key>` and an idempotency-key; a 2xx answer's `id` is
 * the email's. The same key answers the same id, as Resend does for 24 hours.
 */
class Resend {
  constructor() {
    this.name = 'resend';
    this.prefix = '/resend';
    this.delay = 'resend';
    this.byKey = new BoundedMap(KEPT_MAX);
    this.routes = [
      { method: 'POST', path: /^\/emails$/, route: 'POST /emails', handle: (r) => this.send(r) },
    ];
  }

  refuse(request) {
    return headerOf(request, 'authorization').replace(/^Bearer\s*/i, '')
      ? null
      : json(401, {
          statusCode: 401,
          name: 'missing_api_key',
          message: 'Missing API key in the authorization header',
        });
  }

  send(request) {
    const body = request.body ?? {};
    const to = Array.isArray(body.to) ? body.to : [body.to];
    if (
      !text(body.from) ||
      to.length === 0 ||
      !to.every((address) => text(address).includes('@')) ||
      !text(body.subject) ||
      (!text(body.text) && !text(body.html))
    ) {
      return json(422, {
        statusCode: 422,
        name: 'validation_error',
        message: 'The from, to, subject and text or html fields are required.',
      });
    }
    const key = headerOf(request, 'idempotency-key');
    const earlier = key ? this.byKey.get(key) : undefined;
    if (earlier !== undefined) return json(200, { id: earlier });
    const id = randomUUID();
    if (key) this.byKey.set(key, id);
    return json(200, { id });
  }
}

/**
 * gemini-address-reader.ts: POST /models/<model>:generateContent with `x-goog-api-key`; it reads the first candidate's
 * first part's text as JSON of name, phone, zilla, thana, address and note, each a string or null. The answer here is
 * canned, with the message's first mobile number in it, as the server's own stand-in reader finds it.
 */
class Gemini {
  constructor() {
    this.name = 'gemini';
    this.prefix = '/gemini/v1beta';
    this.delay = 'gemini';
    this.routes = [
      {
        method: 'POST',
        path: /^\/models\/([^/:]+):generateContent$/,
        route: 'POST /models/:model:generateContent',
        handle: (r, model) => this.generate(r, model),
      },
    ];
  }

  refuse(request) {
    return headerOf(request, 'x-goog-api-key')
      ? null
      : json(403, {
          error: {
            code: 403,
            message: "Method doesn't allow unregistered callers.",
            status: 'PERMISSION_DENIED',
          },
        });
  }

  generate(request, model) {
    const contents = request.body?.contents;
    const words = (Array.isArray(contents) ? contents : [])
      .flatMap((content) => (Array.isArray(content?.parts) ? content.parts : []))
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n');
    if (!words.trim()) {
      return json(400, {
        error: {
          code: 400,
          message: '* GenerateContentRequest.contents: contents is not specified',
          status: 'INVALID_ARGUMENT',
        },
      });
    }
    const latin = words.replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - BANGLA_ZERO));
    const details = {
      name: 'Rahim Uddin',
      phone: WRITTEN_MOBILE.exec(latin)?.[0] ?? null,
      zilla: 'Dhaka',
      thana: 'Mirpur',
      address: 'House 12, Road 3, Mirpur 10',
      note: null,
    };
    const written = JSON.stringify(details);
    const promptTokens = Math.ceil(words.length / 4) + 400;
    const answerTokens = Math.ceil(written.length / 4);
    return json(200, {
      candidates: [
        {
          content: { parts: [{ text: written }], role: 'model' },
          finishReason: 'STOP',
          index: 0,
        },
      ],
      usageMetadata: {
        promptTokenCount: promptTokens,
        candidatesTokenCount: answerTokens,
        totalTokenCount: promptTokens + answerTokens,
      },
      modelVersion: model,
      responseId: hex(8),
    });
  }
}

/** RedX's areas: one for each of Lytro's thanas, in its zilla; a few of Dhaka's when the file can't be read. */
function redxAreasOf(file) {
  let named = FALLBACK_AREAS;
  let from = 'a built-in list (no locations file)';
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const all = data.zillas.flatMap((zilla) =>
      zilla.thanas.map((thana) => ({ name: thana.nameEn, district: zilla.nameEn })),
    );
    if (all.length > 0) {
      named = all;
      from = file;
    }
  } catch {
    // The built-in list serves; the start line says so.
  }
  const areas = named.map((area, index) => ({
    id: index + 1,
    name: area.name,
    post_code: null,
    district_name: area.district,
    division_name: null,
    zone_id: 1,
  }));
  return { areas, from };
}

class TooLarge extends Error {}

async function bodyOf(incoming) {
  const chunks = [];
  let size = 0;
  for await (const chunk of incoming) {
    size += chunk.length;
    if (size > BODY_MAX_BYTES) throw new TooLarge('body too large');
    chunks.push(chunk);
  }
  if (size === 0) return null;
  const raw = Buffer.concat(chunks).toString('utf8');
  const type = String(incoming.headers['content-type'] ?? '').toLowerCase();
  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function send(response, reply) {
  if (reply.body === null) {
    response.writeHead(reply.status, reply.headers);
    response.end();
    return;
  }
  const payload = Buffer.from(JSON.stringify(reply.body));
  response.writeHead(reply.status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': payload.length,
    ...reply.headers,
  });
  response.end(payload);
}

/** The stand-in: every provider over HTTPS, and its own three routes over plain HTTP too. */
class OutsideServer {
  constructor(settings, tls, areas) {
    this.settings = settings;
    this.delays = new Delays(settings.delays);
    this.stats = new Stats();
    this.inbox = new SmsInbox(KEPT_MAX);
    this.providers = [
      new BulkSmsBd(this.inbox, this.stats),
      new Steadfast(),
      new Pathao(),
      new Redx(areas),
      new Bkash(),
      new Resend(),
      new Gemini(),
    ];
    this.https = createHttpsServer(tls, (incoming, response) => {
      this.serve(incoming, response, true);
    });
    this.http = createHttpServer((incoming, response) => {
      this.serve(incoming, response, false);
    });
    for (const server of [this.https, this.http]) {
      // Longer than the server's fetch keeps an idle connection, so the stand-in never closes one under it.
      server.keepAliveTimeout = 30_000;
      server.headersTimeout = 35_000;
    }
  }

  serve(incoming, response, secure) {
    const method = incoming.method ?? 'GET';
    const url = new URL(incoming.url ?? '/', 'https://outside');
    bodyOf(incoming)
      .then((body) => {
        const request = {
          method,
          path: url.pathname,
          query: url.searchParams,
          headers: incoming.headers,
          body,
        };
        return this.answer(request, secure);
      })
      .then((reply) => {
        send(response, reply);
      })
      .catch((error) => {
        if (error instanceof TooLarge) {
          send(response, json(413, { error: 'body too large' }, { connection: 'close' }));
          return;
        }
        // The stand-in's own fault, in its own words; never the request's body.
        const why = error instanceof Error ? `${error.name}: ${error.message}` : 'Error';
        log(`${method} ${url.pathname} failed: ${why.slice(0, 200)}`);
        if (!response.headersSent) send(response, json(500, { error: 'the stand-in failed' }));
        else response.destroy();
      });
  }

  async answer(request, secure) {
    if (request.method === 'GET') {
      if (request.path === '/health') return json(200, { ok: true });
      if (request.path === '/stats') return json(200, this.stats.toJSON());
      if (request.path === '/codes') return this.codes(request);
    }
    if (secure) {
      const provider = this.providers.find(
        (each) => request.path === each.prefix || request.path.startsWith(`${each.prefix}/`),
      );
      const rest = provider ? request.path.slice(provider.prefix.length) : '';
      for (const route of provider?.routes ?? []) {
        const match = route.method === request.method ? route.path.exec(rest) : null;
        if (!match) continue;
        this.stats.count(provider.name, route.route);
        await this.delays.wait(provider.delay);
        // BulkSMSBD has no refusal of its own here: its key is in the form, which its route reads.
        const refused = route.open ? null : (provider.refuse?.(request) ?? null);
        return refused ?? route.handle(request, ...match.slice(1).map(decoded));
      }
    }
    const line = this.stats.unknown(request.method, request.path);
    if (line !== null) log(line);
    return json(404, { error: 'no stand-in route', method: request.method, path: request.path });
  }

  codes(request) {
    const phone = request.query.get('phone') ?? '';
    if (lastTen(phone) === null) {
      return json(400, { error: 'phone= must name a number of at least 10 digits' });
    }
    const sms = this.inbox.newest(phone);
    if (sms === undefined) return json(404, { error: 'no SMS reached this number', phone });
    return json(200, { phone: sms.phone, text: sms.text, code: codeIn(sms.text) });
  }

  async listen() {
    const { host, port, codesPort } = this.settings;
    const on = (server, wanted) =>
      new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(wanted, host, () => {
          server.off('error', reject);
          resolve(server.address().port);
        });
      });
    return { port: await on(this.https, port), codesPort: await on(this.http, codesPort) };
  }

  close() {
    for (const server of [this.https, this.http]) {
      server.close();
      server.closeAllConnections();
    }
  }
}

function main() {
  let settings;
  let tls;
  try {
    settings = settingsOf(process.env);
  } catch (error) {
    process.stderr.write(`outside: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
  try {
    tls = {
      cert: readFileSync(join(settings.certDir, 'server.pem')),
      key: readFileSync(join(settings.certDir, 'server.key')),
    };
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : 'unreadable';
    process.stderr.write(
      `outside: no certificate in ${settings.certDir} (server.pem, server.key: ${code}); start.sh makes one\n`,
    );
    process.exit(1);
  }
  const redx = redxAreasOf(settings.locationsFile);
  const outside = new OutsideServer(settings, tls, redx.areas);
  outside.listen().then(
    ({ port, codesPort }) => {
      const { sms, courier, bkash, resend, gemini } = settings.delays;
      log(
        `listening on https://${settings.host}:${String(port)} (every provider) and ` +
          `http://${settings.host}:${String(codesPort)} (codes, stats, health); delays in ms, ±30%: ` +
          `sms ${String(sms)}, courier ${String(courier)}, bkash ${String(bkash)}, resend ${String(resend)}, ` +
          `gemini ${String(gemini)}; ${String(redx.areas.length)} RedX areas from ${redx.from}`,
      );
    },
    (error) => {
      process.stderr.write(
        `outside: can't listen: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exit(1);
    },
  );
  // As PID 1 in its container, Node has no default for these; without them `docker stop` waits out its timeout.
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => {
      outside.close();
      process.exit(0);
    });
  }
}

main();
