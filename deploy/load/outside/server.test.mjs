// The load test's outside stand-in (Phase 9 Slice 9.10), proven the way the server's adapters read it: start.sh's
// certificate, each provider's success route (the fields each adapter reads), the delay, the codes route on both ports,
// and unknown paths. Run from the repo root: node --test deploy/load/outside/
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawn, spawnSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { Agent, request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { after, before, describe, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, URL, URLSearchParams } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
// Git for Windows' own tools, when they aren't on PATH.
const GIT_TOOLS = 'C:/Program Files/Git/usr/bin';
const SMS_DELAY_MS = 50;

/** A tool that runs, from PATH or Git for Windows; null if neither has it. */
function toolOf(name, ...args) {
  for (const candidate of [name, `${GIT_TOOLS}/${name}.exe`]) {
    const tried = spawnSync(candidate, args, { stdio: 'ignore' });
    if (!tried.error && tried.status === 0) return candidate;
  }
  return null;
}

const openssl = toolOf('openssl', 'version');
const sh = toolOf('sh', '-c', 'exit 0');
const missing = [openssl ? null : 'openssl', sh ? null : 'sh'].filter(Boolean).join(' and ');
const skip = missing
  ? `${missing} is on neither PATH nor ${GIT_TOOLS}: start.sh needs it to make the certificate`
  : false;

/** The environment with the shell's own folder first, so start.sh finds mkdir and chmod beside a Git sh. */
function envFor(extra) {
  const env = { ...process.env, ...extra };
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
  if (sh?.includes('/')) env[pathKey] = `${dirname(sh)}${delimiter}${env[pathKey] ?? ''}`;
  return env;
}

const forward = (path) => path.replace(/\\/g, '/');

describe('the outside stand-in', { skip }, () => {
  let certDir;
  let ca;
  let child;
  let port;
  let codesPort;
  const lines = [];

  before(async () => {
    certDir = mkdtempSync(join(tmpdir(), 'p87-outside-'));
    const made = spawnSync(sh, [forward(join(here, 'start.sh')), 'true'], {
      env: envFor({ CERT_DIR: forward(certDir), OPENSSL: openssl }),
      encoding: 'utf8',
    });
    assert.equal(made.status, 0, `start.sh failed: ${made.stderr}`);
    ca = readFileSync(join(certDir, 'ca.pem'));
    child = spawn(process.execPath, [join(here, 'server.mjs')], {
      env: {
        ...process.env,
        PORT: '0',
        CODES_PORT: '0',
        HOST: '127.0.0.1',
        CERT_DIR: certDir,
        LOCATIONS_FILE: join(repo, 'packages', 'db', 'data', 'locations.json'),
        DELAY_MS_SMS: String(SMS_DELAY_MS),
        DELAY_MS_COURIER: '5',
        DELAY_MS_BKASH: '5',
        DELAY_MS_RESEND: '5',
        DELAY_MS_GEMINI: '5',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    [port, codesPort] = await new Promise((resolve, reject) => {
      let pending = '';
      child.stdout.on('data', (chunk) => {
        pending += String(chunk);
        const whole = pending.split('\n');
        pending = whole.pop() ?? '';
        for (const line of whole) {
          lines.push(line);
          const started = /https:\/\/[^\s:]+:(\d+).*http:\/\/[^\s:]+:(\d+)/.exec(line);
          if (started) resolve([Number(started[1]), Number(started[2])]);
        }
      });
      child.once('exit', (code) => {
        reject(new Error(`the stand-in stopped (${String(code)}): ${stderr}`));
      });
    });
  });

  after(() => {
    child?.kill();
    if (certDir && existsSync(certDir)) rmSync(certDir, { recursive: true, force: true });
  });

  /**
   * One call over HTTPS, checking the certificate against start.sh's authority for the name `localhost`; on its own
   * connection, or on `agent`'s kept one.
   */
  function call(method, path, { headers = {}, body, form, agent = false } = {}) {
    return over(httpsRequest, { port, ca, servername: 'localhost', agent }, method, path, {
      headers,
      body,
      form,
    });
  }

  function plain(path) {
    return over(httpRequest, { port: codesPort }, 'GET', path, {});
  }

  function over(request, options, method, path, { headers = {}, body, form }) {
    const payload = form
      ? new URLSearchParams(form).toString()
      : body !== undefined
        ? JSON.stringify(body)
        : undefined;
    const type = form
      ? { 'content-type': 'application/x-www-form-urlencoded' }
      : body !== undefined
        ? { 'content-type': 'application/json' }
        : {};
    const started = performance.now();
    return new Promise((resolve, reject) => {
      const sent = request(
        {
          host: '127.0.0.1',
          agent: false,
          method,
          path,
          headers: { ...type, ...headers },
          ...options,
        },
        (response) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            let json = null;
            try {
              json = JSON.parse(raw);
            } catch {
              // Not every answer has a body.
            }
            resolve({
              status: response.statusCode,
              headers: response.headers,
              json,
              ms: performance.now() - started,
            });
          });
        },
      );
      sent.on('error', reject);
      sent.end(payload);
    });
  }

  test("start.sh's certificate: its own authority, and a server certificate for outside and localhost", () => {
    const authority = new X509Certificate(ca);
    const server = new X509Certificate(readFileSync(join(certDir, 'server.pem')));
    assert.equal(authority.ca, true);
    assert.equal(server.ca, false);
    assert.equal(server.checkHost('outside'), 'outside');
    assert.equal(server.checkHost('localhost'), 'localhost');
    assert.ok(server.checkIssued(authority));
    assert.ok(server.verify(authority.publicKey));
    for (const name of ['ca.key', 'server.key']) assert.ok(existsSync(join(certDir, name)));
    // Run again, it keeps what is there: the API already trusts that authority.
    const again = spawnSync(sh, [forward(join(here, 'start.sh')), 'true'], {
      env: envFor({ CERT_DIR: forward(certDir), OPENSSL: openssl }),
      encoding: 'utf8',
    });
    assert.equal(again.status, 0);
    assert.deepEqual(readFileSync(join(certDir, 'ca.pem')), ca);
  });

  test("the server's fetch trusts it through NODE_EXTRA_CA_CERTS, as the API containers do", () => {
    const fetched = spawnSync(
      process.execPath,
      [
        '-e',
        `fetch('https://127.0.0.1:${String(port)}/health').then((r) => r.text().then((t) => process.stdout.write(r.status + ' ' + t)), (e) => { process.stderr.write(String(e.cause ?? e)); process.exit(1); })`,
      ],
      { env: { ...process.env, NODE_EXTRA_CA_CERTS: join(certDir, 'ca.pem') }, encoding: 'utf8' },
    );
    assert.equal(fetched.status, 0, fetched.stderr);
    assert.equal(fetched.stdout, '200 {"ok":true}');
  });

  test('health answers 200 on both ports', async () => {
    assert.equal((await call('GET', '/health')).status, 200);
    assert.equal((await plain('/health')).status, 200);
  });

  test('BulkSMSBD: response_code 202 and a message_id (bulksmsbd.provider.ts), after the SMS delay', async () => {
    // One kept connection, so the time measured is the answer's, not a TLS handshake's.
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    await call('GET', '/health', { agent });
    const health = await call('GET', '/health', { agent });
    const sent = await call('POST', '/bulksmsbd/api/smsapi', {
      agent,
      form: {
        api_key: 'load-key',
        type: 'text',
        number: '8801711000001',
        senderid: 'Lytro',
        message: 'Lytro-এ লগইনের জন্য OTP হচ্ছে 482913। কারো সাথে শেয়ার করবেন না।',
      },
    });
    assert.equal(sent.status, 200);
    assert.equal(sent.json.response_code, 202);
    assert.equal(typeof sent.json.message_id, 'number');
    agent.destroy();
    // 50 ms, less its 30%, on a connection that answers health in a few: the delay was waited.
    assert.ok(sent.ms >= SMS_DELAY_MS * 0.7 - 1, `answered in ${sent.ms.toFixed(1)} ms`);
    assert.ok(
      health.ms < sent.ms,
      `health ${health.ms.toFixed(1)} ms, SMS ${sent.ms.toFixed(1)} ms`,
    );
    const missingKey = await call('POST', '/bulksmsbd/api/smsapi', {
      form: { type: 'text', number: '8801711000001', senderid: 'Lytro', message: 'x' },
    });
    assert.equal(missingKey.json.response_code, 1003);
  });

  test('codes: the newest SMS to a number, matched on its last 10 digits, on HTTPS and plain HTTP', async () => {
    const sms = (number, message) =>
      call('POST', '/bulksmsbd/api/smsapi', {
        form: { api_key: 'k', type: 'text', number, senderid: 'Lytro', message },
      });
    await sms('8801812000002', 'Your Shop OTP is 111111. Do not share it with anyone.');
    await sms('8801812000002', 'Call 01812000002 for help; your OTP is 222222.');
    for (const phone of ['01812000002', '8801812000002', '%2B8801812000002']) {
      const read = await plain(`/codes?phone=${phone}`);
      assert.equal(read.status, 200);
      assert.equal(read.json.code, '222222');
      assert.equal(read.json.phone, '8801812000002');
      assert.match(read.json.text, /222222/);
    }
    assert.equal((await call('GET', '/codes?phone=01812000002')).json.code, '222222');
    assert.equal((await plain('/codes?phone=01999000999')).status, 404);
    await sms('8801913000003', 'আপনার শপ Test তৈরি হয়েছে। শপ চালান এখানে: https://app.lytro.app');
    const noCode = await plain('/codes?phone=01913000003');
    assert.equal(noCode.status, 200);
    assert.equal(noCode.json.code, null);
    assert.equal((await plain('/codes')).status, 400);
  });

  test('plain HTTP serves only codes, stats and health', async () => {
    const provider = await plain('/bulksmsbd/api/smsapi');
    assert.equal(provider.status, 404);
    assert.equal(provider.json.path, '/bulksmsbd/api/smsapi');
    assert.equal((await plain('/steadfast/api/v1/get_balance')).status, 404);
  });

  test('Steadfast: balance, a booking, status by consignment and invoice, fraud check, payouts (steadfast-adapter.ts)', async () => {
    const keys = { 'Api-Key': 'sf-load-key', 'Secret-Key': 'sf-load-secret' };
    const base = '/steadfast/api/v1';
    const balance = await call('GET', `${base}/get_balance`, { headers: keys });
    assert.equal(balance.status, 200);
    assert.equal(balance.json.status, 200);
    const booking = {
      invoice: '261114-0001',
      recipient_name: 'Rahim Uddin',
      recipient_phone: '01711000001',
      recipient_address: 'House 12, Road 3, Mirpur 10, Dhaka',
      cod_amount: 1200,
    };
    const booked = await call('POST', `${base}/create_order`, { headers: keys, body: booking });
    assert.equal(booked.status, 200);
    assert.equal(booked.json.status, 200);
    const { consignment } = booked.json;
    assert.equal(typeof consignment.consignment_id, 'number');
    assert.equal(typeof consignment.tracking_code, 'string');
    assert.equal(consignment.status, 'in_review');
    const again = await call('POST', `${base}/create_order`, { headers: keys, body: booking });
    assert.equal(again.status, 400);
    assert.ok(again.json.errors.invoice);
    const byId = await call('GET', `${base}/status_by_cid/${String(consignment.consignment_id)}`, {
      headers: keys,
    });
    assert.equal(byId.status, 200);
    assert.equal(byId.json.delivery_status, 'in_review');
    const byInvoice = await call('GET', `${base}/status_by_invoice/261114-0001`, { headers: keys });
    assert.equal(byInvoice.json.delivery_status, 'in_review');
    assert.equal((await call('GET', `${base}/status_by_cid/1`, { headers: keys })).status, 404);
    const fraud = await call('GET', `${base}/fraud_check/score/01711000001`, { headers: keys });
    assert.equal(fraud.status, 200);
    assert.ok('delivery_ratio' in fraud.json);
    assert.deepEqual(fraud.json.fraud_categories, []);
    const payouts = await call('GET', `${base}/payments?page=1`, { headers: keys });
    assert.deepEqual(payouts.json.payments, []);
    assert.equal((await call('GET', `${base}/get_balance`)).status, 401);
  });

  test('Pathao: tokens, stores, a booking and its status (pathao-adapter.ts)', async () => {
    const base = '/pathao/aladdin/api/v1';
    const client = { client_id: 'pathao-client', client_secret: 'pathao-secret' };
    const login = await call('POST', `${base}/issue-token`, {
      body: { ...client, username: 'm@example.com', password: 'pw', grant_type: 'password' },
    });
    assert.equal(login.status, 200);
    assert.equal(typeof login.json.access_token, 'string');
    assert.equal(typeof login.json.refresh_token, 'string');
    assert.ok(Number.isFinite(login.json.expires_in));
    const renewed = await call('POST', `${base}/issue-token`, {
      body: { ...client, refresh_token: login.json.refresh_token, grant_type: 'refresh_token' },
    });
    assert.equal(renewed.status, 200);
    assert.notEqual(renewed.json.access_token, login.json.access_token);
    const wrong = await call('POST', `${base}/issue-token`, {
      body: { ...client, username: 'm@example.com', grant_type: 'password' },
    });
    assert.equal(wrong.status, 400);
    const auth = { Authorization: `Bearer ${String(renewed.json.access_token)}` };
    const stores = await call('GET', `${base}/stores`, { headers: auth });
    const [store] = stores.json.data.data;
    assert.ok(store.store_id);
    assert.equal(store.is_active, 1);
    const booking = {
      store_id: store.store_id,
      merchant_order_id: '261114-0002',
      recipient_name: 'Karim',
      recipient_phone: '01711000002',
      recipient_address: 'House 1, Road 2, Dhanmondi, Dhaka',
      delivery_type: 48,
      item_type: 2,
      item_quantity: 1,
      item_weight: 0.5,
      amount_to_collect: 900,
    };
    const booked = await call('POST', `${base}/orders`, { headers: auth, body: booking });
    assert.equal(booked.status, 200);
    assert.equal(typeof booked.json.data.consignment_id, 'string');
    assert.equal(booked.json.data.order_status, 'Pending');
    assert.equal(booked.json.data.delivery_fee, 60);
    const info = await call('GET', `${base}/orders/${booked.json.data.consignment_id}/info`, {
      headers: auth,
    });
    assert.equal(info.status, 200);
    assert.equal(info.json.data.order_status_slug, 'Pending');
    assert.equal(typeof info.json.data.updated_at, 'string');
    const badStore = await call('POST', `${base}/orders`, {
      headers: auth,
      body: { ...booking, store_id: 999 },
    });
    assert.equal(badStore.status, 422);
    assert.equal((await call('GET', `${base}/orders/DL0/info`, { headers: auth })).status, 404);
    assert.equal((await call('GET', `${base}/stores`)).status, 401);
  });

  test("RedX: areas named after Lytro's thanas, stores, a booking, its status and a cancel (redx-adapter.ts)", async () => {
    const base = '/redx/v1.0.0-beta';
    const auth = { 'API-ACCESS-TOKEN': 'Bearer redx-load-token' };
    const areas = await call('GET', `${base}/areas`, { headers: auth });
    assert.equal(areas.status, 200);
    const mirpur = areas.json.areas.find(
      (area) => area.name === 'Mirpur' && area.district_name === 'Dhaka',
    );
    assert.ok(mirpur, 'Dhaka has an area named Mirpur');
    assert.ok(areas.json.areas.length > 400, 'every thana has an area');
    const stores = await call('GET', `${base}/pickup/stores`, { headers: auth });
    assert.ok(stores.json.pickup_stores[0].id);
    const booking = {
      customer_name: 'Karim',
      customer_phone: '01711000003',
      delivery_area: mirpur.name,
      delivery_area_id: mirpur.id,
      customer_address: 'House 4, Road 5, Mirpur 10',
      merchant_invoice_id: '261114-0003',
      cash_collection_amount: '1500',
      parcel_weight: 500,
      value: 1500,
    };
    const booked = await call('POST', `${base}/parcel`, { headers: auth, body: booking });
    assert.equal(booked.status, 201);
    assert.equal(typeof booked.json.tracking_id, 'string');
    const info = await call('GET', `${base}/parcel/info/${booked.json.tracking_id}`, {
      headers: auth,
    });
    assert.equal(info.json.parcel.status, 'pickup-pending');
    assert.equal(info.json.parcel.delivery_type, 'regular');
    const cancelled = await call('PATCH', `${base}/parcels`, {
      headers: auth,
      body: {
        entity_type: 'parcel-tracking-id',
        entity_id: booked.json.tracking_id,
        update_details: { property_name: 'status', new_value: 'cancelled', reason: 'x' },
      },
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.json.success, true);
    const afterCancel = await call('GET', `${base}/parcel/info/${booked.json.tracking_id}`, {
      headers: auth,
    });
    assert.equal(afterCancel.json.parcel.status, 'cancelled');
    const badArea = await call('POST', `${base}/parcel`, {
      headers: auth,
      body: { ...booking, delivery_area_id: 999_999 },
    });
    assert.equal(badArea.status, 400);
    assert.ok(Array.isArray(badArea.json.validation_errors));
    assert.equal((await call('GET', `${base}/areas`)).status, 401);
  });

  test('bKash: a token, then create, the checkout page, query and execute (bkash-gateway.ts)', async () => {
    const base = '/bkash/v2/tokenized-checkout';
    const auth = { username: 'bkash-user', password: 'bkash-password' };
    const keys = { app_key: 'bkash-app-key', app_secret: 'bkash-app-secret' };
    const granted = await call('POST', `${base}/auth/grant-token`, { headers: auth, body: keys });
    assert.equal(granted.json.statusCode, '0000');
    assert.equal(typeof granted.json.id_token, 'string');
    assert.equal(typeof granted.json.refresh_token, 'string');
    const refreshed = await call('POST', `${base}/auth/refresh-token`, {
      headers: auth,
      body: { ...keys, refresh_token: granted.json.refresh_token },
    });
    assert.equal(refreshed.json.statusCode, '0000');
    assert.equal(typeof refreshed.json.id_token, 'string');
    const refused = await call('POST', `${base}/auth/grant-token`, { body: keys });
    assert.notEqual(refused.json.statusCode, '0000');
    const token = { authorization: refreshed.json.id_token, 'x-app-key': keys.app_key };
    const callbackURL = 'https://api.lytro.test/v1/pay/AB12CD/gateway-return';
    const create = () =>
      call('POST', `${base}/payment/create`, {
        headers: token,
        body: {
          payerReference: '01711000004',
          callbackURL,
          amount: '1250.00',
          currency: 'BDT',
          intent: 'sale',
          merchantInvoiceNumber: '261114-0004',
        },
      });
    const created = await create();
    assert.equal(created.status, 200);
    const { paymentId, bkashURL } = created.json;
    assert.equal(typeof paymentId, 'string');
    assert.equal(created.json.paymentID, paymentId);
    const page = new URL(bkashURL);
    assert.equal(page.pathname, '/bkash/checkout');
    const queried = await call('POST', `${base}/query/payment`, {
      headers: token,
      body: { paymentId },
    });
    assert.equal(queried.json.transactionStatus, 'Initiated');
    assert.equal(queried.json.verificationStatus, 'Incomplete');
    // The shopper on bKash's page: sent back to the callback with paymentID and status=success.
    const visited = await call('GET', `${page.pathname}${page.search}`);
    assert.equal(visited.status, 302);
    const back = new URL(visited.headers.location);
    assert.equal(`${back.origin}${back.pathname}`, callbackURL);
    assert.equal(back.searchParams.get('paymentID'), paymentId);
    assert.equal(back.searchParams.get('status'), 'success');
    const authorised = await call('POST', `${base}/query/payment`, {
      headers: token,
      body: { paymentId },
    });
    assert.equal(authorised.json.verificationStatus, 'Complete');
    const executed = await call('POST', `${base}/payment/execute`, {
      headers: token,
      body: { paymentId },
    });
    assert.equal(executed.status, 200);
    assert.equal(executed.json.statusCode, '0000');
    assert.equal(executed.json.transactionStatus, 'Completed');
    assert.equal(typeof executed.json.trxID, 'string');
    assert.equal(executed.json.amount, '1250.00');
    assert.match(executed.json.payerAccount, /^01\d{9}$/);
    const twice = await call('POST', `${base}/payment/execute`, {
      headers: token,
      body: { paymentId },
    });
    assert.equal(twice.json.externalCode, '2062');
    const settled = await call('POST', `${base}/query/payment`, {
      headers: token,
      body: { paymentId },
    });
    assert.equal(settled.json.transactionStatus, 'Completed');
    assert.equal(settled.json.trxID, executed.json.trxID);
    // Straight to the callback, as a load script may: execute still completes.
    const direct = await create();
    const straight = await call('POST', `${base}/payment/execute`, {
      headers: token,
      body: { paymentId: direct.json.paymentId },
    });
    assert.equal(straight.json.transactionStatus, 'Completed');
    const noToken = await call('POST', `${base}/payment/execute`, { body: { paymentId } });
    assert.ok(noToken.json.externalCode);
  });

  test('Resend: an id, the same one for the same idempotency key (resend-mail.provider.ts)', async () => {
    const email = {
      from: 'Lytro <no-reply@mail.lytro.app>',
      to: ['owner@example.com'],
      subject: 'A test',
      text: 'Hello',
    };
    const headers = { authorization: 'Bearer re_load', 'idempotency-key': 'outbox-1' };
    const sent = await call('POST', '/resend/emails', { headers, body: email });
    assert.equal(sent.status, 200);
    assert.equal(typeof sent.json.id, 'string');
    const again = await call('POST', '/resend/emails', { headers, body: email });
    assert.equal(again.json.id, sent.json.id);
    assert.equal((await call('POST', '/resend/emails', { body: email })).status, 401);
    const noTo = await call('POST', '/resend/emails', {
      headers: { authorization: 'Bearer re_load' },
      body: { ...email, to: [] },
    });
    assert.equal(noTo.status, 422);
  });

  test('Gemini: a candidate whose text is the six delivery details as JSON (gemini-address-reader.ts)', async () => {
    const asked = await call(
      'POST',
      '/gemini/v1beta/models/gemini-3.5-flash-lite:generateContent',
      {
        headers: { 'x-goog-api-key': 'gemini-load-key' },
        body: {
          systemInstruction: { parts: [{ text: 'You read a message...' }] },
          contents: [{ role: 'user', parts: [{ text: 'নাম রহিম, ফোন ০১৭১১-০০০০০৫, মিরপুর ১০' }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        },
      },
    );
    assert.equal(asked.status, 200);
    const details = JSON.parse(asked.json.candidates[0].content.parts[0].text);
    for (const field of ['name', 'phone', 'zilla', 'thana', 'address', 'note']) {
      assert.ok(field in details, field);
      assert.ok(details[field] === null || typeof details[field] === 'string', field);
    }
    assert.equal(details.phone, '01711-000005');
    const noKey = await call('POST', '/gemini/v1beta/models/m:generateContent', {
      body: { contents: [{ parts: [{ text: 'x' }] }] },
    });
    assert.equal(noKey.status, 403);
  });

  test('an unknown path answers 404 naming it, and logs one line however often it comes', async () => {
    for (let time = 0; time < 2; time += 1) {
      const unknown = await call('POST', '/steadfast/api/v1/no_such_route');
      assert.equal(unknown.status, 404);
      assert.equal(unknown.json.path, '/steadfast/api/v1/no_such_route');
    }
    assert.equal((await call('GET', '/nowhere')).status, 404);
    // The log comes through a pipe, the answer over TLS: wait for the line, then a little longer for any second one.
    const loggedLines = () =>
      lines.filter((line) => line.includes('/steadfast/api/v1/no_such_route'));
    for (let waited = 0; waited < 2000 && loggedLines().length === 0; waited += 20) await sleep(20);
    await sleep(100);
    const logged = loggedLines();
    assert.equal(logged.length, 1);
    assert.match(logged[0], /no route for POST \/steadfast\/api\/v1\/no_such_route/);
  });

  test('stats: calls by provider and route, SMS sent, unknown paths', async () => {
    const stats = await plain('/stats');
    assert.equal(stats.status, 200);
    assert.ok(stats.json.calls.bulksmsbd['POST /smsapi'] >= 4);
    assert.ok(stats.json.calls.steadfast['POST /create_order'] >= 2);
    assert.ok(stats.json.calls.bkash['POST /v2/tokenized-checkout/payment/execute'] >= 3);
    assert.ok(stats.json.smsSent >= 4);
    assert.ok(stats.json.unknown.calls >= 3);
    assert.equal(stats.json.unknown.paths['POST /steadfast/api/v1/no_such_route'], 2);
  });
});
