import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { EDGE_HEADER } from '../src/common/guards/tenant.guard';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { prepareTestDatabase } from './support/database';
import { getJson, postJson } from './support/http';

// Every route except health refuses requests that did not come through the edge (R3), including sign-in routes.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_edge_test';
const EDGE_SECRET = 'edge-e2e-secret-0123456789abcdef0123';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;

let app: INestApplication;
let port: number;
let admin: pg.Client;
const sent: { toPhone: string; body: string }[] = [];

function textedCode(phone: string): string {
  const last = [...sent].reverse().find((m) => m.toPhone === phone);
  return /(\d{6})/.exec(last?.body ?? '')?.[1] ?? '';
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const { adminDbUrl, appDbUrl } = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();
  process.env['DATABASE_URL'] = appDbUrl;
  process.env['OTP_SECRET'] = 'edge-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['TRUSTED_EDGE_SECRET'] = EDGE_SECRET;
  process.env['NODE_ENV'] = 'production';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue({
      send: (message: { toPhone: string; body: string }) => {
        sent.push(message);
        return Promise.resolve();
      },
    })
    .compile();
  app = moduleRef.createNestApplication();
  await app.listen(0, '127.0.0.1');
  port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

describeIfDatabase('the trusted edge on every route (R3, R6)', () => {
  it('refuses a sign-in request that did not come through the edge', async () => {
    const response = await postJson(port, '/auth/phone/code', { phone: '01711111111' });
    expect(response.status).toBe(403);
  });

  it('accepts the same request when it carries the edge secret', async () => {
    const response = await postJson(
      port,
      '/auth/phone/code',
      { phone: '01711111111' },
      { [EDGE_HEADER]: EDGE_SECRET },
    );
    expect(response.status).toBe(200);
  });

  it('records the forwarded client address on a failed sign-in and on the new session (D14)', async () => {
    const phone = `0171${randomUUID().replace(/\D/g, '').slice(0, 7)}`;
    const headers = { [EDGE_HEADER]: EDGE_SECRET, 'cf-connecting-ip': '203.0.113.7' };
    const requested = await postJson(port, '/auth/phone/code', { phone }, headers);
    expect(requested.status).toBe(200);
    const code = textedCode(phone);
    const wrong = code === '000000' ? '111111' : '000000';
    expect(
      (await postJson(port, '/auth/phone/verify', { phone, code: wrong }, headers)).status,
    ).toBe(400);

    const failure = await admin.query<{ ip: string }>(
      "SELECT ip::text AS ip FROM control.sign_in_failures WHERE ip = '203.0.113.7' LIMIT 1",
    );
    expect(failure.rows).toHaveLength(1);

    const signedIn = await postJson(port, '/auth/phone/verify', { phone, code }, headers);
    expect(signedIn.status).toBe(200);
    const session = await admin.query<{ ip: string }>(
      `SELECT host(s.ip) AS ip FROM control.sessions s
       JOIN control.subscriber_identities i ON i.subscriber_id = s.subscriber_id
       WHERE i.value = $1 ORDER BY s.created_at DESC LIMIT 1`,
      [phone],
    );
    expect(session.rows[0]?.ip).toBe('203.0.113.7');
  });

  it('keeps health open for load balancers without the edge secret', async () => {
    const response = await getJson(port, '/health');
    expect(response.status).toBe(200);
  });
});
