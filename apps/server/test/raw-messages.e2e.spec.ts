import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CourierRepository,
  PaymentMethodRepository,
  TransactionRunner,
  type Transaction,
} from '@lytronix/db';
import { GatewayAnswerAction, PaymentMethod, RAW_MESSAGE_KEPT_DAYS } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { DAY_MS } from '../src/common/time';
import { DatabaseService } from '../src/database/database.service';
import { COURIER_FETCH, COURIER_PAUSE } from '../src/modules/couriers/tokens';
import {
  LYTRO_GATEWAY_OWNER,
  type CredentialUseLog,
} from '../src/modules/gateway/ports/wallet-gateway';
import { CREDENTIAL_USE_LOG } from '../src/modules/gateway/tokens';
import { RawMessagePurge } from '../src/modules/reconciliation/services/raw-message-purge';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { CourierBookingTickWorker } from '../src/modules/shared/queue-workers/services/courier-booking-tick-worker';
import { CourierNightTickWorker } from '../src/modules/shared/queue-workers/services/courier-night-tick-worker';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { FakeSteadfast, freshSteadfastKeys, signatureOf } from './support/fake-steadfast';
import { postToApiHost } from './support/http';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// DAT-51, D9-16 (Phase 9 Slice 9.5): a courier's message kept as it arrived before it is read, an unreadable one kept for the
// operator, a gateway's answer kept as it came, and both removed past their [90] days or with their shop. Runs only with
// DATABASE_TEST_ADMIN_URL.

const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_raw_messages_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 });

let app: INestApplication;
let port: number;
let admin: pg.Client;
const steadfast = new FakeSteadfast();
const texts = new SmsCapture();

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'raw-messages-e2e-otp-secret-012345678901234';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
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
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

interface Connected {
  shop: ShopClient;
  path: string;
  token: string;
}

async function connected(): Promise<Connected> {
  const shop = await openShop(port, texts, 'raw');
  const made = await shop.post('/couriers/connections', {
    courierKey: 'steadfast',
    credentials: freshSteadfastKeys(),
  });
  expect(made.status, JSON.stringify(made.body)).toBe(200);
  const { message } = made.body as { message: { address: string; token: string } };
  return { shop, path: new URL(message.address).pathname, token: message.token };
}

interface RawRow {
  id: string;
  body: string;
  headers: Record<string, string>;
  outcome: string;
  event_id: string | null;
}

async function rawOf(tenantId: string): Promise<RawRow[]> {
  const { rows } = await admin.query<RawRow>(
    `SELECT id, body, headers, outcome, event_id FROM tenant.courier_raw_messages
     WHERE tenant_id = $1 ORDER BY received_at`,
    [tenantId],
  );
  return rows;
}

function inTx<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
  return app.get(TransactionRunner).run(app.get(DatabaseService).handle.db, work);
}

describeIfDatabase('courier messages kept as they arrived (DAT-51)', () => {
  it('keeps a verified message before reading it: read, with its event, and only the headers it is read by', async () => {
    const to = await connected();
    const body = {
      notification_type: 'tracking_update',
      consignment_id: 4242,
      invoice: 'RAW-1',
      tracking_message: 'Picked up.',
      updated_at: '2026-11-13 10:00:00',
    };
    const idempotencyKey = randomUUID();
    const answered = await postToApiHost(port, to.path, body, {
      'x-signature': signatureOf(JSON.stringify(body), to.token),
      'idempotency-key': idempotencyKey,
    });
    expect(answered.status, JSON.stringify(answered.body)).toBe(202);

    const rows = await rawOf(to.shop.tenantId);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]?.body ?? '{}')).toEqual(body);
    expect(rows[0]?.outcome).toBe('read');
    expect(rows[0]?.event_id).not.toBeNull();
    // Never the signature: only what the message is read by.
    expect(rows[0]?.headers).toEqual({
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey,
    });
  });

  it('keeps a verified message it cannot read, marked unread, instead of dropping it', async () => {
    const to = await connected();
    const body = { something: 'a courier changed its wording', at: 1 };
    const answered = await postToApiHost(port, to.path, body, {
      'x-signature': signatureOf(JSON.stringify(body), to.token),
      'idempotency-key': randomUUID(),
    });
    expect(answered.status, JSON.stringify(answered.body)).toBe(202);
    const rows = await rawOf(to.shop.tenantId);
    expect(rows.map((row) => [row.outcome, row.event_id])).toEqual([['unread', null]]);
    expect(JSON.parse(rows[0]?.body ?? '{}')).toEqual(body);
  });

  it('keeps nothing of a message that fails its signature', async () => {
    const to = await connected();
    const body = { notification_type: 'tracking_update', consignment_id: 1 };
    const answered = await postToApiHost(port, to.path, body, {
      'x-signature': signatureOf(JSON.stringify(body), 'not-the-token'),
    });
    expect(answered.status).toBe(401);
    expect(await rawOf(to.shop.tenantId)).toEqual([]);
  });

  it("removes a shop's kept messages with its courier data (LIF-19)", async () => {
    const to = await connected();
    await admin.query(
      `INSERT INTO tenant.courier_raw_messages (tenant_id, courier_key, body) VALUES ($1, 'steadfast', '{}')`,
      [to.shop.tenantId],
    );
    await inTx((tx) => app.get(CourierRepository).deleteAllForTenant(tx, to.shop.tenantId));
    expect(await rawOf(to.shop.tenantId)).toEqual([]);
  });
});

describeIfDatabase('gateway answers kept as they came (DAT-51)', () => {
  const answer = (tenantId: string, sessionId: string) => ({
    tenantId,
    method: PaymentMethod.Bkash,
    action: GatewayAnswerAction.Execute,
    sessionId,
    paymentId: `TR${randomUUID().slice(0, 8)}`,
    answer: JSON.stringify({ transactionStatus: 'Completed', trxID: 'ABC123', amount: '500' }),
    transactionStatus: 'Completed',
    at: new Date(),
  });

  it("names a shop's checkout by its shop, and Lytro's own by none", async () => {
    const log = app.get<CredentialUseLog>(CREDENTIAL_USE_LOG);
    const shop = await openShop(port, texts, 'raw');
    const shopSession = randomUUID();
    const lytroPayment = randomUUID();
    await log.keepAnswer(answer(shop.tenantId, shopSession));
    await log.keepAnswer(answer(LYTRO_GATEWAY_OWNER, lytroPayment));
    const { rows } = await admin.query<{
      tenant_id: string | null;
      session_id: string;
      transaction_status: string;
    }>(
      `SELECT tenant_id, session_id, transaction_status FROM control.gateway_answers
       WHERE session_id = ANY($1::uuid[]) ORDER BY tenant_id NULLS FIRST`,
      [[shopSession, lytroPayment]],
    );
    expect(rows).toEqual([
      { tenant_id: null, session_id: lytroPayment, transaction_status: 'Completed' },
      { tenant_id: shop.tenantId, session_id: shopSession, transaction_status: 'Completed' },
    ]);

    // A deleted shop's answers go with its payment methods; Lytro's own stay their days.
    await inTx((tx) => app.get(PaymentMethodRepository).deleteAllForTenant(tx, shop.tenantId));
    const left = await admin.query<{ session_id: string }>(
      'SELECT session_id FROM control.gateway_answers WHERE session_id = ANY($1::uuid[])',
      [[shopSession, lytroPayment]],
    );
    expect(left.rows.map((row) => row.session_id)).toEqual([lytroPayment]);
  });
});

describeIfDatabase(
  `raw messages removed past their ${String(RAW_MESSAGE_KEPT_DAYS)} days (DAT-51)`,
  () => {
    it('removes what is older and keeps what is not, couriers and gateways alike', async () => {
      const to = await connected();
      const now = new Date();
      const old = new Date(now.getTime() - (RAW_MESSAGE_KEPT_DAYS * DAY_MS + DAY_MS));
      const young = new Date(now.getTime() - (RAW_MESSAGE_KEPT_DAYS * DAY_MS - DAY_MS));
      await admin.query(
        `INSERT INTO tenant.courier_raw_messages (tenant_id, courier_key, body, received_at)
       VALUES ($1, 'steadfast', 'old', $2), ($1, 'steadfast', 'young', $3)`,
        [to.shop.tenantId, old, young],
      );
      const oldSession = randomUUID();
      const youngSession = randomUUID();
      await admin.query(
        `INSERT INTO control.gateway_answers (tenant_id, method, action, session_id, payment_id, answer, received_at)
       VALUES (NULL, 'bkash', 'query', $1, 'P1', '{}', $3), (NULL, 'bkash', 'query', $2, 'P2', '{}', $4)`,
        [oldSession, youngSession, old, young],
      );

      const removed = await app.get(RawMessagePurge).run(now);
      expect(removed.courierMessages).toBeGreaterThanOrEqual(1);
      expect(removed.gatewayAnswers).toBeGreaterThanOrEqual(1);
      expect((await rawOf(to.shop.tenantId)).map((row) => row.body)).toEqual(['young']);
      const left = await admin.query<{ session_id: string }>(
        'SELECT session_id FROM control.gateway_answers WHERE session_id = ANY($1::uuid[])',
        [[oldSession, youngSession]],
      );
      expect(left.rows.map((row) => row.session_id)).toEqual([youngSession]);
    });
  },
);
