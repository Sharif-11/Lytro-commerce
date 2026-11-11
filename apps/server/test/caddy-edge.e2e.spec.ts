import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { EDGE_HEADER } from '../src/common/guards/tenant.guard';
import type { MessageKey } from '../src/common/i18n/message-key';
import { translate } from '../src/common/i18n/messages';
import { COURIER_FETCH, COURIER_PAUSE } from '../src/modules/couriers/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { CourierBookingTickWorker } from '../src/modules/shared/queue-workers/services/courier-booking-tick-worker';
import { CourierNightTickWorker } from '../src/modules/shared/queue-workers/services/courier-night-tick-worker';
import { listenOn } from './support/bootstrap';
import { CaddyEdge, dockerAnswers, type EdgeAnswer } from './support/caddy-edge';
import { prepareTestDatabase } from './support/database';
import { FakeSteadfast, freshSteadfastKeys, signatureOf } from './support/fake-steadfast';
import { sendExact } from './support/http';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// KNOWN-GAPS §141 (2026-11-10): every call another service makes reaches the server through the edge as it will once the
// domain is live. deploy/Caddyfile runs in Caddy in a container in front of this server, which requires the edge's secret,
// and each kind of outside call goes through it by host name over HTTPS: the public API with a key, a courier's message, a
// wallet's return, the listener app and Resend's notices, all at api.<domain>/v1/... Before, every spec called the server
// directly, so Caddy's rewrite of /v1/ to /api/v1/ and its 404 for the courier addresses went unseen. Each answer is
// checked to be the server's own, from the route meant, never the edge's. Runs only when DATABASE_TEST_ADMIN_URL is set and
// a Docker engine answers; in CI a missing Docker fails the run instead of skipping it.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_caddy_edge_test';
const DOCKER = ADMIN_URL ? dockerAnswers() : false;
if (ADMIN_URL && !DOCKER && process.env['CI']) {
  throw new Error('the Caddy edge spec needs a Docker engine in CI, to run deploy/Caddyfile');
}
const describeIfEdge = ADMIN_URL && DOCKER ? describe : describe.skip;
// Starting the container, and in CI pulling its image first, takes longer than a spec's usual setup.
vi.setConfig({ hookTimeout: 180_000, testTimeout: 40_000 });

const EDGE_SECRET = randomBytes(32).toString('hex');
const SITE = 'https://myshop.com';

let app: INestApplication | undefined;
let port: number;
let edge: CaddyEdge;
let shop: ShopClient;
const steadfast = new FakeSteadfast();
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL || !DOCKER) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'caddy-edge-e2e-otp-secret-0123456789012345';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['TRUSTED_EDGE_SECRET'] = EDGE_SECRET;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(COURIER_FETCH)
    .useValue(steadfast.fetch)
    .overrideProvider(COURIER_PAUSE)
    .useValue(() => Promise.resolve())
    .overrideProvider(CourierBookingTickWorker)
    .useValue({})
    .overrideProvider(CourierNightTickWorker)
    .useValue({})
    .compile();
  // Docker Desktop brings a container's calls to this computer's loopback; on Linux they come over Docker's bridge.
  ({ app, port } = await listenOn(moduleRef, {
    host: process.platform === 'linux' ? '0.0.0.0' : '127.0.0.1',
  }));
  edge = new CaddyEdge({
    PLATFORM_DOMAIN: 'localhost',
    SERVER_UPSTREAM: `host.docker.internal:${String(port)}`,
    TRUSTED_EDGE_SECRET: EDGE_SECRET,
    ACME_EMAIL: 'edge-test@example.com',
  });
  await edge.start();
  shop = await openShop(port, texts, 'cde', { [EDGE_HEADER]: EDGE_SECRET });
});

afterAll(async () => {
  if (!ADMIN_URL || !DOCKER) return;
  await edge.stop();
  await app?.close();
});

/** The server's own words for a refusal, as its error envelope carries them; the edge's own 404 has none. */
function said(answer: EdgeAnswer): string | undefined {
  return (answer.json as { message?: string } | undefined)?.message;
}

function words(key: MessageKey): string {
  return translate(key, 'en');
}

describeIfEdge('every outside call through the edge (deploy/Caddyfile, KNOWN-GAPS §141)', () => {
  it('lets nothing reach the server without the edge’s secret, so each answer below came through the edge', async () => {
    const direct = await sendExact(port, 'GET', '/v1/shop', undefined, { host: 'api.localhost' });
    expect(direct.status).toBe(403);
    expect((direct.body as { error: { code: string } }).error.code).toBe('forbidden');
  });

  it('serves the public API at api.<domain>/v1 with a key (API-14)', async () => {
    const made = await shop.post('/api-keys', { name: 'Edge', websites: [SITE] });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const { key } = made.body as { key: string };
    const answered = await edge.send('api.localhost', 'GET', '/v1/shop', undefined, {
      origin: SITE,
      authorization: `Bearer ${key}`,
    });
    expect(answered.status, answered.text).toBe(200);
    expect((answered.json as { data: { slug: string } }).data.slug).toBe(shop.slug);
  });

  it('brings a courier’s message to the shop at the address the shop was given (CRR-11)', async () => {
    const connected = await shop.post('/couriers/connections', {
      courierKey: 'steadfast',
      credentials: freshSteadfastKeys(),
    });
    expect(connected.status, JSON.stringify(connected.body)).toBe(200);
    const { message } = connected.body as { message: { address: string; token: string } };
    const address = new URL(message.address);
    expect(address.hostname).toBe('api.localhost');
    expect(address.pathname.startsWith('/v1/webhooks/couriers/')).toBe(true);
    const body = {
      notification_type: 'delivery_status',
      consignment_id: 9_000_001,
      invoice: 'EDGE-1',
      cod_amount: 0,
      status: 'pending',
      delivery_charge: 60,
      tracking_message: 'Your parcel is pending.',
      updated_at: '2026-11-10 10:00:00',
    };
    const signed = {
      'x-signature': signatureOf(JSON.stringify(body), message.token),
      'idempotency-key': randomUUID(),
    };
    const answered = await edge.send('api.localhost', 'POST', address.pathname, body, signed);
    expect(answered.status, answered.text).toBe(202);
    const { connections } = (await shop.get('/couriers/connections')).body as {
      connections: { messages: string }[];
    };
    expect(connections[0]?.messages).toBe('arriving');

    // An address the server never gave is refused by the server itself, not by the edge.
    const unknown = await edge.send(
      'api.localhost',
      'POST',
      '/v1/webhooks/couriers/not-a-real-address',
      body,
      signed,
    );
    expect(unknown.status).toBe(404);
    expect(said(unknown)).toBe(words('CourierAddressNotKnown'));
    // The address's old shape reaches nothing on the API host.
    const old = await edge.send('api.localhost', 'POST', `/api${address.pathname}`, body, signed);
    expect(old.status).toBe(404);
    expect(said(old)).toBe(words('PageNotFound'));
  });

  it('brings Resend’s notices to the server, which believes only a signed one (NTF-06)', async () => {
    const answered = await edge.send('api.localhost', 'POST', '/v1/webhooks/email/resend', {
      type: 'email.bounced',
      data: { to: ['owner@example.com'], bounce: { type: 'Permanent' } },
    });
    expect(answered.status).toBe(401);
    expect(said(answered)).toBe(words('EmailWebhookNotVerified'));
  });

  it('brings the shopper back from the wallet to the payment page’s own route (VER-08)', async () => {
    const answered = await edge.send(
      'api.localhost',
      'GET',
      '/v1/pay/not-a-real-session/gateway-return?status=cancel',
    );
    expect(answered.status).toBe(404);
    expect(said(answered)).toBe(words('PaymentNotFound'));
  });

  it('reaches the listener app’s routes at api.<domain>/v1/listener/ (LSN-01)', async () => {
    const answered = await edge.send(
      'api.localhost',
      'POST',
      '/v1/listener/pair',
      { code: 'ZZZZ2222', installationId: `install-${randomUUID()}`, model: 'Pixel 7' },
      { 'x-app-version': '1.0.0' },
    );
    expect(answered.status, answered.text).toBe(404);
    expect(said(answered)).toBe(words('ListenerCodeInvalid'));
  });

  it('brings the listener app Lytro’s help line at api.<domain>/v1/listener/help-line (D8-74)', async () => {
    const answered = await edge.send('api.localhost', 'GET', '/v1/listener/help-line', undefined, {
      'x-app-version': '1.0.0',
    });
    expect(answered.status, answered.text).toBe(200);
    expect(answered.json).toMatchObject({
      success: true,
      data: { opensHour: expect.any(Number) as number, closesHour: expect.any(Number) as number },
    });
    expect(answered.headers['cache-control']).toBe('public, max-age=300');
  });

  it('answers nothing but the public API on the API host, and the dashboard’s /api/ on its own host', async () => {
    const onApiHost = await edge.send('api.localhost', 'GET', '/api/v1/me');
    expect(onApiHost.status).toBe(404);
    expect(said(onApiHost)).toBe(words('PageNotFound'));
    // The dashboard's host still forwards /api/ with the secret: the server asks for a sign-in, not for the secret.
    const onAppHost = await edge.send('app.localhost', 'GET', '/api/v1/me');
    expect(onAppHost.status, onAppHost.text).toBe(401);
  });
});
