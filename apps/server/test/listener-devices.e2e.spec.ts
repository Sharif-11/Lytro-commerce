import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LISTENER_CODE_ALPHABET, PlatformSettingKey } from '@lytronix/validators';
import { AppModule } from '../src/app/app.module';
import { ClientIp } from '../src/common/client-ip';
import { headerValue, type HttpRequest } from '../src/common/http';
import type { MessageKey } from '../src/common/i18n/message-key';
import { translate } from '../src/common/i18n/messages';
import type {
  ListenerAutoRevokedNotice,
  ListenerLytroRevokedNotice,
} from '../src/modules/listener/ports/listener-notifier';
import { ListenerDevices } from '../src/modules/listener/services/listener-devices';
import { LISTENER_NOTIFIER } from '../src/modules/listener/tokens';
import { PlatformSettingsService } from '../src/modules/platform-settings/services/platform-settings.service';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenerHashOf } from '../src/modules/listener/services/listener-rules';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { getJson, patchJson, postJson, sendExact, type HttpResult } from './support/http';
import { errorOf, openShop, staffWith, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 5 Slice 5.4a, read agreed 2026-11-01: a shop pairs listener phones with single-use codes (LSN-01, LSN-09 to
// LSN-11), within its plan's limit (LSN-08) and only while it may listen (LSN-07, pay-as-you-go included); a phone's
// token works from its own installation only, three flags revoking it (LSN-12); the app reports in (LSN-03, LSN-13)
// and must be recent enough (LSN-18); the shop and Lytro list, rename, revoke and block (LSN-02, LSN-19 to LSN-22); the
// purge (LSN-05). Runs only when DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_listener_devices_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const OPERATOR_ID = randomUUID();
const VERSION = '1.0.0';

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const revokedNotices: ListenerAutoRevokedNotice[] = [];
const lytroRevoked: ListenerLytroRevokedNotice[] = [];

/** Lets a test play several callers: the address is the `x-test-visitor` header's, else the socket's. */
const visitorIp = {
  resolve(request: HttpRequest): string | null {
    return headerValue(request.headers['x-test-visitor']) ?? request.ip ?? null;
  },
  context(request: HttpRequest): { userAgent: string | null; ip: string | null } {
    return {
      userAgent: headerValue(request.headers['user-agent']) ?? null,
      ip: visitorIp.resolve(request),
    };
  },
};

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'listener-devices-e2e-otp-secret-0123456789';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(ClientIp)
    .useValue(visitorIp)
    .overrideProvider(LISTENER_NOTIFIER)
    .useValue({
      deviceAutoRevoked: (notice: ListenerAutoRevokedNotice) => {
        revokedNotices.push(notice);
        return Promise.resolve();
      },
      deviceRevokedByLytro: (notice: ListenerLytroRevokedNotice) => {
        lytroRevoked.push(notice);
        return Promise.resolve();
      },
    })
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

interface Paired {
  deviceId: string;
  token: string;
  shopName: string;
  heartbeatMinutes: number;
}

interface DeviceList {
  devices: {
    id: string;
    name: string;
    status: string;
    online: boolean;
    revokeReason: string | null;
  }[];
  active: number;
  limit: number | null;
}

/** What the dashboard is told, in the default language (Bangla). */
function said(key: MessageKey): string {
  return translate(key, 'bn');
}

async function codeFor(shop: ShopClient, headers = shop.headers()): Promise<HttpResult> {
  return postJson(port, '/listener/pairing-codes', {}, headers);
}

async function newCode(shop: ShopClient): Promise<string> {
  const made = await codeFor(shop);
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return (made.body as { code: string }).code;
}

function pair(
  code: string,
  installationId: string,
  extra: { visitor?: string; version?: string | null; name?: string } = {},
): Promise<HttpResult> {
  return sendExact(
    port,
    'POST',
    '/v1/listener/pair',
    { code, installationId, model: 'Pixel 7', ...(extra.name ? { name: extra.name } : {}) },
    {
      host: 'api.localhost',
      'content-type': 'application/json',
      'x-test-visitor': extra.visitor ?? '198.51.100.1',
      ...(extra.version === null ? {} : { 'x-app-version': extra.version ?? VERSION }),
    },
  );
}

async function paired(
  shop: ShopClient,
  installationId = `install-${randomUUID()}`,
): Promise<Paired & { installationId: string }> {
  const made = await pair(await newCode(shop), installationId, {
    visitor: `203.0.113.${String(Math.floor(Math.random() * 250))}`,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  return { ...(made.body as Paired), installationId };
}

function heartbeat(
  device: { token: string; installationId: string },
  extra: { installationId?: string; version?: string | null } = {},
): Promise<HttpResult> {
  return sendExact(port, 'POST', '/v1/listener/heartbeat', undefined, {
    host: 'api.localhost',
    authorization: `Bearer ${device.token}`,
    'x-installation-id': extra.installationId ?? device.installationId,
    ...(extra.version === null ? {} : { 'x-app-version': extra.version ?? VERSION }),
  });
}

async function devicesOf(shop: ShopClient): Promise<DeviceList> {
  const listed = await shop.get('/listener/devices');
  expect(listed.status, JSON.stringify(listed.body)).toBe(200);
  return listed.body as DeviceList;
}

async function logged(tenantId: string, action: string): Promise<unknown[]> {
  const { rows } = await admin.query<{ summary: unknown }>(
    'SELECT summary FROM tenant.activity_log WHERE tenant_id = $1 AND action = $2 ORDER BY created_at',
    [tenantId, action],
  );
  return rows.map((row) => row.summary);
}

async function platformLogged(tenantId: string, action: string): Promise<number> {
  const { rows } = await admin.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM control.platform_audit_log WHERE action = $1 AND summary->>'tenantId' = $2`,
    [action, tenantId],
  );
  return rows[0]?.n ?? 0;
}

describeIfDatabase('pairing a listener phone (LSN-01, LSN-03, LSN-09, LSN-11, LSN-22)', () => {
  it('pairs with a single-use code; the token, kept only as a hash, works from its installation; audited', async () => {
    const shop = await openShop(port, texts, 'lis');
    const made = await codeFor(shop);
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const { code, expiresAt } = made.body as { code: string; expiresAt: string };
    expect(code).toMatch(new RegExp(`^[${LISTENER_CODE_ALPHABET}]{8}$`));
    const minutes = (Date.parse(expiresAt) - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(9.9);
    expect(minutes).toBeLessThanOrEqual(10);
    const stored = await admin.query(
      'SELECT code_hash FROM control.listener_pairing_codes WHERE tenant_id = $1',
      [shop.tenantId],
    );
    expect(stored.rows).toEqual([{ code_hash: listenerHashOf(code) }]);

    const first = await pair(code.toLowerCase(), 'install-aaaa1111', { name: 'Counter phone' });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const device = first.body as Paired;
    expect(device).toMatchObject({ heartbeatMinutes: 15, deviceName: 'Counter phone' });
    expect(device.token.length).toBeGreaterThanOrEqual(43);
    const row = await admin.query<{ token_hash: string; name: string; tenant_id: string }>(
      'SELECT token_hash, name, tenant_id FROM control.listener_devices WHERE id = $1',
      [device.deviceId],
    );
    expect(row.rows).toEqual([
      {
        token_hash: createHash('sha256').update(device.token).digest('hex'),
        name: 'Counter phone',
        tenant_id: shop.tenantId,
      },
    ]);
    const again = await pair(code, 'install-bbbb2222');
    expect(again.status).toBe(404);
    expect(errorOf(again).code).toBe('not_found');

    const beat = await heartbeat({ token: device.token, installationId: 'install-aaaa1111' });
    expect(beat.status, JSON.stringify(beat.body)).toBe(200);
    expect(beat.body).toMatchObject({
      status: 'connected',
      heartbeatMinutes: 15,
      deviceName: 'Counter phone',
      shopName: device.shopName,
    });
    expect(await devicesOf(shop)).toMatchObject({
      active: 1,
      limit: 1,
      devices: [{ id: device.deviceId, name: 'Counter phone', status: 'active', online: true }],
    });
    expect(await logged(shop.tenantId, 'listener_device_paired')).toEqual([
      { name: 'Counter phone', model: 'Pixel 7', appVersion: VERSION },
    ]);
    expect(await platformLogged(shop.tenantId, 'listener_device_paired')).toBe(1);
  });

  it("ticks Home's checklist with a phone paired, and unticks it when that phone is cancelled", async () => {
    const shop = await openShop(port, texts, 'lis');
    const listening = async (): Promise<unknown> =>
      ((await shop.get('/home')).body as { checklist: { listenerPhone: unknown } }).checklist
        .listenerPhone;
    expect(await listening()).toBe(false);
    const phone = await paired(shop);
    expect(await listening()).toBe(true);
    const cancelled = await shop.post(`/listener/devices/${phone.deviceId}/revoke`, {});
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    expect(await listening()).toBe(false);
  });

  it('refuses a code run out, five wrong codes from one caller, and a code refused ten times', async () => {
    const shop = await openShop(port, texts, 'lis');
    const lapsed = await newCode(shop);
    await admin.query(
      "UPDATE control.listener_pairing_codes SET expires_at = now() - interval '1 minute' WHERE code_hash = $1",
      [listenerHashOf(lapsed)],
    );
    expect((await pair(lapsed, 'install-lapsed01', { visitor: '198.51.100.40' })).status).toBe(404);

    const good = await newCode(shop);
    for (let index = 0; index < 5; index += 1) {
      const wrong = await pair('ZZZZZZZZ', 'install-guess001', { visitor: '198.51.100.41' });
      expect(wrong.status).toBe(404);
    }
    const sixth = await pair(good, 'install-guess001', { visitor: '198.51.100.41' });
    expect(sixth.status).toBe(429);
    expect(errorOf(sixth).message).toBe(said('ListenerTooManyTries'));
    // The caller that ran out could not use the right code; another caller still can.
    expect((await pair(good, 'install-other001', { visitor: '198.51.100.42' })).status).toBe(201);

    // A code refused ten times is void, even for an installation it would now pair.
    const other = await openShop(port, texts, 'lis');
    const tried = await newCode(other);
    await app
      .get(ListenerDevices)
      .blockInstallation('install-banned01', 'Abuse', OPERATOR_ID, null);
    for (let index = 0; index < 10; index += 1) {
      const refused = await pair(tried, 'install-banned01', {
        visitor: `198.51.100.${String(50 + index)}`,
      });
      expect(refused.status).toBe(403);
    }
    const voided = await pair(tried, 'install-fine0001', { visitor: '198.51.100.70' });
    expect(voided.status).toBe(404);
  });
});

describeIfDatabase("the plan's phones and the shop's state (LSN-07, LSN-08, LSN-18)", () => {
  // Found at the Phase 5 close-out: both counted the shop's phones before either was in, and both passed.
  it('lets one of two phones pairing at the same moment on a one-phone plan in (LSN-08)', async () => {
    const shop = await openShop(port, texts, 'lis');
    const [codeA, codeB] = [await newCode(shop), await newCode(shop)];
    const both = await Promise.all([
      pair(codeA, `install-${randomUUID()}`, { visitor: '198.51.100.71' }),
      pair(codeB, `install-${randomUUID()}`, { visitor: '198.51.100.72' }),
    ]);
    expect(both.map((row) => row.status).sort((a, b) => a - b)).toEqual([201, 402]);
    expect((await devicesOf(shop)).active).toBe(1);
  });

  it("holds a Trial shop to one phone, in both logs; revoking frees the place and refuses the phone's next call", async () => {
    const shop = await openShop(port, texts, 'lis');
    const spare = await newCode(shop);
    const first = await paired(shop);
    const full = await codeFor(shop);
    expect(full.status).toBe(402);
    expect(errorOf(full)).toMatchObject({ code: 'plan_limit_reached', details: { limit: 1 } });
    const late = await pair(spare, 'install-late0001', { visitor: '198.51.100.80' });
    expect(late.status).toBe(402);
    expect(await logged(shop.tenantId, 'listener_limit_refused')).toEqual([
      { limit: 1, active: 1 },
      { limit: 1, active: 1 },
    ]);
    expect(await platformLogged(shop.tenantId, 'listener_limit_refused')).toBe(2);

    const revoked = await shop.post(`/listener/devices/${first.deviceId}/revoke`, {});
    expect(revoked.status, JSON.stringify(revoked.body)).toBe(200);
    expect(revoked.body).toMatchObject({ status: 'revoked', revokeReason: 'owner' });
    const refused = await heartbeat(first);
    expect(refused.status).toBe(401);
    expect(errorOf(refused)).toMatchObject({
      code: 'unauthenticated',
      details: { reason: 'owner' },
    });
    expect((await shop.post(`/listener/devices/${first.deviceId}/revoke`, {})).status).toBe(409);
    expect(await logged(shop.tenantId, 'listener_device_revoked')).toHaveLength(1);
    expect(await platformLogged(shop.tenantId, 'listener_device_revoked')).toBe(1);
    expect((await codeFor(shop)).status).toBe(201);
  });

  it('lets a pay-as-you-go shop listen; refuses a suspended or read-only shop, and an app older than the minimum', async () => {
    const shop = await openShop(port, texts, 'lis');
    const phone = await paired(shop);
    await admin.query("UPDATE control.tenants SET state = 'pay_as_you_go' WHERE id = $1", [
      shop.tenantId,
    ]);
    expect((await heartbeat(phone)).status).toBe(200);
    await admin.query('UPDATE control.tenants SET suspended_at = now() WHERE id = $1', [
      shop.tenantId,
    ]);
    const suspended = await heartbeat(phone);
    expect(suspended.status).toBe(403);
    expect(errorOf(suspended)).toMatchObject({ code: 'tenant_offline' });
    await admin.query(
      "UPDATE control.tenants SET suspended_at = NULL, state = 'read_only' WHERE id = $1",
      [shop.tenantId],
    );
    expect((await heartbeat(phone)).status).toBe(403);
    await admin.query("UPDATE control.tenants SET state = 'trial' WHERE id = $1", [shop.tenantId]);
    expect((await heartbeat(phone)).status).toBe(200);

    const settings = app.get(PlatformSettingsService);
    await settings.set(PlatformSettingKey.ListenerMinAppVersion, '1.2.0', randomUUID());
    try {
      const old = await heartbeat(phone, { version: '1.1.9' });
      expect(old.status).toBe(426);
      expect(errorOf(old)).toMatchObject({
        code: 'app_update_required',
        details: { minimum: '1.2.0' },
      });
      expect((await heartbeat(phone, { version: null })).status).toBe(426);
      expect((await pair('ABCDEFGH', 'install-old00001', { version: '1.0.5' })).status).toBe(426);
      expect((await heartbeat(phone, { version: '1.10.0' })).status).toBe(200);
    } finally {
      await settings.set(PlatformSettingKey.ListenerMinAppVersion, '1.0.0', randomUUID());
    }
  });
});

describeIfDatabase('a phone and its installation (LSN-12, LSN-13, LSN-02)', () => {
  it('flags calls from another installation; the third flag revokes the phone and tells its owner and Lytro', async () => {
    const shop = await openShop(port, texts, 'lis');
    const phone = await paired(shop);
    for (let index = 0; index < 3; index += 1) {
      const stolen = await heartbeat(phone, { installationId: 'install-thief001' });
      expect(stolen.status).toBe(401);
      expect(errorOf(stolen).message).toBe(said('ListenerTokenInvalid'));
    }
    const list = await devicesOf(shop);
    expect(list.devices[0]).toMatchObject({ status: 'revoked', revokeReason: 'flags' });
    expect(list.active).toBe(0);
    expect(revokedNotices.filter((notice) => notice.tenantId === shop.tenantId)).toEqual([
      { tenantId: shop.tenantId, deviceId: phone.deviceId, name: 'Pixel 7', flags: 3 },
    ]);
    expect(await logged(shop.tenantId, 'listener_device_flagged')).toHaveLength(3);
    expect(await logged(shop.tenantId, 'listener_device_revoked')).toEqual([
      { name: 'Pixel 7', reason: 'flags' },
    ]);
    expect(await platformLogged(shop.tenantId, 'listener_device_flagged')).toBe(3);
    const own = await heartbeat(phone);
    expect(errorOf(own)).toMatchObject({ code: 'unauthenticated', details: { reason: 'flags' } });
  });

  it('holds a phone to four reports an hour, and refuses an unknown token', async () => {
    const shop = await openShop(port, texts, 'lis');
    const phone = await paired(shop);
    for (let index = 0; index < 4; index += 1) {
      expect((await heartbeat(phone)).status).toBe(200);
    }
    expect((await heartbeat(phone)).status).toBe(429);
    const unknown = await heartbeat({ token: 'not-a-token', installationId: phone.installationId });
    expect(unknown.status).toBe(401);
  });
});

describeIfDatabase("the shop's and Lytro's view of phones (LSN-19 to LSN-21, SEC-02)", () => {
  it("renames and lists only the shop's own phones; listener:read lists, listener:manage changes", async () => {
    const shop = await openShop(port, texts, 'lis');
    const phone = await paired(shop);
    const renamed = await shop.patch(`/listener/devices/${phone.deviceId}`, { name: 'Front desk' });
    expect(renamed.status, JSON.stringify(renamed.body)).toBe(200);
    expect(renamed.body).toMatchObject({ name: 'Front desk' });
    expect(await logged(shop.tenantId, 'listener_device_renamed')).toEqual([
      { from: 'Pixel 7', to: 'Front desk' },
    ]);
    // Agreed 2026-11-03 (Slice 5.5b's read): a rename reaches the app's menu at its next report.
    expect((await heartbeat(phone)).body).toMatchObject({ deviceName: 'Front desk' });
    const other = await openShop(port, texts, 'lis');
    expect(
      (await other.patch(`/listener/devices/${phone.deviceId}`, { name: 'Mine' })).status,
    ).toBe(404);
    expect((await other.post(`/listener/devices/${phone.deviceId}/revoke`, {})).status).toBe(404);
    expect((await devicesOf(other)).devices).toEqual([]);
    expect((await heartbeat(phone)).status).toBe(200);

    const reader = await staffWith(port, texts, admin, shop, ['listener:read']);
    expect((await getJson(port, '/listener/devices', reader)).status).toBe(200);
    expect((await codeFor(shop, reader)).status).toBe(403);
    expect(
      (await postJson(port, `/listener/devices/${phone.deviceId}/revoke`, {}, reader)).status,
    ).toBe(403);
    expect(
      (await patchJson(port, `/listener/devices/${phone.deviceId}`, { name: 'x' }, reader)).status,
    ).toBe(403);
  });

  it('lets Lytro list any shop’s phones, revoke one, and block an installation across shops', async () => {
    const devices = app.get(ListenerDevices);
    const first = await openShop(port, texts, 'lis');
    const second = await openShop(port, texts, 'lis');
    const one = await paired(first, 'install-shared01');
    const two = await paired(second, 'install-shared01');
    expect(await devices.listForOperator(first.tenantId)).toMatchObject({ active: 1, limit: 1 });
    expect(
      await devices.blockInstallation(
        'install-shared01',
        'Selling fake receipts',
        OPERATOR_ID,
        null,
      ),
    ).toBe(2);
    for (const phone of [one, two]) {
      expect(errorOf(await heartbeat(phone))).toMatchObject({
        details: { reason: 'installation_blocked' },
      });
    }
    // LSN-21: each shop's owner is told (found missing at the Phase 5 close-out).
    for (const [shop, phone] of [
      [first, one],
      [second, two],
    ] as const) {
      expect(lytroRevoked.filter((row) => row.tenantId === shop.tenantId)).toEqual([
        expect.objectContaining({ deviceId: phone.deviceId, reason: 'installation_blocked' }),
      ]);
    }
    const third = await openShop(port, texts, 'lis');
    const blocked = await pair(await newCode(third), 'install-shared01', {
      visitor: '198.51.100.90',
    });
    expect(blocked.status).toBe(403);
    expect(errorOf(blocked).message).toBe(said('ListenerInstallationBlocked'));
    const platform = await admin.query(
      "SELECT summary FROM control.platform_audit_log WHERE action = 'listener_installation_blocked' AND summary->>'installationId' = $1",
      ['install-shared01'],
    );
    expect(platform.rows).toEqual([
      {
        summary: {
          installationId: 'install-shared01',
          reason: 'Selling fake receipts',
          revoked: 2,
        },
      },
    ]);

    const fourth = await paired(third);
    await devices.operatorRevoke(fourth.deviceId, OPERATOR_ID, '203.0.113.9');
    expect(errorOf(await heartbeat(fourth))).toMatchObject({ details: { reason: 'operator' } });
    expect(lytroRevoked.filter((row) => row.tenantId === third.tenantId)).toEqual([
      expect.objectContaining({ deviceId: fourth.deviceId, reason: 'operator' }),
    ]);
    await expect(devices.operatorRevoke(fourth.deviceId, OPERATOR_ID, null)).rejects.toMatchObject({
      code: 'conflict',
    });
    await expect(devices.listForOperator(randomUUID())).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(
      (await getJson(port, `/operator/tenants/${third.tenantId}/listener-devices`, {})).status,
    ).toBe(401);
  });

  it('purges spent codes and long-revoked phones; working ones stay', async () => {
    const shop = await openShop(port, texts, 'lis');
    const phone = await paired(shop);
    await shop.post(`/listener/devices/${phone.deviceId}/revoke`, {});
    const keep = await paired(shop);
    await admin.query(
      `UPDATE control.listener_pairing_codes SET used_at = now() - interval '2 days'
       WHERE id = (SELECT id FROM control.listener_pairing_codes WHERE tenant_id = $1 ORDER BY created_at LIMIT 1)`,
      [shop.tenantId],
    );
    await admin.query(
      "UPDATE control.listener_devices SET revoked_at = now() - interval '31 days' WHERE id = $1",
      [phone.deviceId],
    );
    await app.get(ListenerDevices).purge(new Date());
    const left = await admin.query<{ id: string }>(
      'SELECT id FROM control.listener_devices WHERE tenant_id = $1',
      [shop.tenantId],
    );
    expect(left.rows.map((row) => row.id)).toEqual([keep.deviceId]);
    const codes = await admin.query(
      'SELECT 1 FROM control.listener_pairing_codes WHERE tenant_id = $1 AND used_at IS NOT NULL',
      [shop.tenantId],
    );
    expect(codes.rowCount).toBe(1);
  });
});
