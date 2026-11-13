import 'dotenv/config';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { LISTENER_RELEASE_FETCH } from '../src/modules/listener/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { getJson, sendExact } from './support/http';

// TENANT-DASHBOARD-DESIGN §7.44 (small fixes, 2026-11-13): GET /listener/app, the listener app's release for the
// dashboard's download button, keyless like the help line, read from LISTENER_DOWNLOAD_URL's latest.json. Runs only
// with DATABASE_TEST_ADMIN_URL.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_listener_release_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
vi.setConfig({ testTimeout: 60_000 });

const HOST = 'https://download-staging.lytro.app';
const asked: string[] = [];
let app: INestApplication;
let port: number;

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'listener-release-e2e-otp-secret-0123456789';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  process.env['LISTENER_DOWNLOAD_URL'] = HOST;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(LISTENER_RELEASE_FETCH)
    .useValue((url: string) => {
      asked.push(url);
      return Promise.resolve(
        Response.json({
          version: '1.0.0-staging',
          file: 'lytro-listener-1.0.0-staging.apk',
          sha256: 'c'.repeat(64),
          bytes: 2_923_023,
        }),
      );
    })
    .compile();
  ({ app, port } = await listenOn(moduleRef));
}, 180_000);

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
});

describeIfDatabase("the listener app's release for the dashboard (§7.44)", () => {
  it("answers anyone, with no session, from the downloads host it's set to, and may be cached", async () => {
    const answered = await getJson(port, '/listener/app', { host: 'localhost' });
    expect(answered.status, JSON.stringify(answered.body)).toBe(200);
    expect(answered.body).toEqual({
      release: {
        version: '1.0.0-staging',
        url: `${HOST}/lytro-listener-1.0.0-staging.apk`,
        bytes: 2_923_023,
      },
    });
    expect(answered.headers['cache-control']).toBe('public, max-age=300');
    expect(asked).toEqual([`${HOST}/latest.json`]);
  });

  it("is the dashboard's, not served on the API host", async () => {
    const onApiHost = await sendExact(port, 'GET', '/v1/listener/app', undefined, {
      host: 'api.localhost',
    });
    expect(onApiHost.status).toBe(404);
  });
});
