import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MEDIA_BLOCKED_KEY, mediaOriginsKey, type MediaBlockedList } from '@lytronix/shared-types';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app/app.module';
import { dhakaDate } from '../src/common/time';
import type {
  BandwidthNotice,
  BandwidthNotifier,
} from '../src/modules/media/ports/bandwidth-notifier';
import {
  EdgeUnavailable,
  type EdgeStoreChanges,
  type MediaEdge,
  type MediaUsageTotal,
} from '../src/modules/media/ports/media-edge';
import { GB, MediaBandwidth } from '../src/modules/media/services/media-bandwidth';
import { MediaEraser } from '../src/modules/media/services/media-eraser';
import {
  BANDWIDTH_NOTIFIER,
  MEDIA_CLOCK,
  MEDIA_EDGE,
  MEDIA_STORAGE,
} from '../src/modules/media/tokens';
import { SMS_PROVIDER } from '../src/modules/shared/messaging/tokens';
import { listenOn } from './support/bootstrap';
import { prepareTestDatabase } from './support/database';
import { MemoryStorage } from './support/memory-storage';
import { openShop, type ShopClient } from './support/shop-client';
import { SmsCapture } from './support/sms-capture';

// Phase 3 Slice 7b: the server's side of the media Worker -- each minute the Worker's usage is added to each shop's
// cycle and day, once; the shop is warned at 50, 80 and 95 percent; the shared store gets the blocked list and each
// shop's website addresses; the dashboard reads the cycle and its days. BND-01 to BND-03, BND-05, BND-06, BND-08,
// MED-10, MED-13. Cloudflare is a memory stand-in and the pass's clock is the test's. Runs only when
// DATABASE_TEST_ADMIN_URL is set.
const ADMIN_URL = process.env['DATABASE_TEST_ADMIN_URL'];
const DB_NAME = 'lytronix_media_bandwidth_test';
const describeIfDatabase = ADMIN_URL ? describe : describe.skip;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const DHAKA_OFFSET_MS = 6 * 60 * MINUTE_MS;

/** Cloudflare as the server sees it: the Worker's data points, and the shared store it writes. */
class MemoryEdge implements MediaEdge {
  readonly points: MediaUsageTotal[] = [];
  readonly store = new Map<string, string>();
  readonly writes: EdgeStoreChanges[] = [];
  /** While true, Cloudflare cannot be reached. */
  down = false;

  record(tenantId: string, minute: Date, bytes: number, requests = 1): void {
    this.points.push({ tenantId, minute, bytes, requests });
  }

  usageByMinute(from: Date, to: Date): Promise<MediaUsageTotal[]> {
    if (this.down) return Promise.reject(new EdgeUnavailable('down in this test'));
    return Promise.resolve(
      this.points.filter((point) => point.minute >= from && point.minute < to),
    );
  }

  write(changes: EdgeStoreChanges): Promise<void> {
    if (this.down) return Promise.reject(new EdgeUnavailable('down in this test'));
    this.writes.push(changes);
    if (changes.blocked) this.store.set(MEDIA_BLOCKED_KEY, JSON.stringify(changes.blocked));
    for (const shop of changes.origins) {
      this.store.set(mediaOriginsKey(shop.tenantId), JSON.stringify(shop.origins));
    }
    return Promise.resolve();
  }

  blocked(): MediaBlockedList {
    return JSON.parse(this.store.get(MEDIA_BLOCKED_KEY) ?? '{}') as MediaBlockedList;
  }

  originsOf(tenantId: string): string[] | undefined {
    const value = this.store.get(mediaOriginsKey(tenantId));
    return value === undefined ? undefined : (JSON.parse(value) as string[]);
  }

  originWritesFor(tenantId: string): number {
    return this.writes.filter((write) => write.origins.some((shop) => shop.tenantId === tenantId))
      .length;
  }
}

/** Keeps every warning, in place of the console stand-in. */
class WarningCapture implements BandwidthNotifier {
  readonly notices: BandwidthNotice[] = [];

  bandwidthWarning(notice: BandwidthNotice): Promise<void> {
    this.notices.push(notice);
    return Promise.resolve();
  }

  percentsFor(tenantId: string): number[] {
    return this.notices.filter((notice) => notice.tenantId === tenantId).map((n) => n.percent);
  }
}

interface Usage {
  cycleStart: string;
  usedBytes: number;
  requests: number;
  limitBytes: number | null;
  days: { day: string; bytes: number; requests: number }[];
}

let app: INestApplication;
let port: number;
let admin: pg.Client;
const texts = new SmsCapture();
const edge = new MemoryEdge();
const warnings = new WarningCapture();
// The pass's clock, ahead of real time so every minute the tests record comes after the shops were made; the tests
// move it on instead of waiting. The cron the app runs reads the same clock, so it can only do what a test would.
let clockMs = Date.now() + 10 * MINUTE_MS;

function floorMinute(ms: number): number {
  return Math.floor(ms / MINUTE_MS) * MINUTE_MS;
}

/** Moves the clock on, so what is recorded next falls after what the pass has already totalled. */
function advance(minutes: number): void {
  clockMs += minutes * MINUTE_MS;
}

/** A minute old enough to be totalled now: the pass waits a minute for each minute's data points. */
function settledMinute(): Date {
  return new Date(floorMinute(clockMs) - 2 * MINUTE_MS);
}

/** Records the shop's media sending these bytes, and runs the minute's pass. */
async function serve(shop: ShopClient, bytes: number, requests = 1): Promise<void> {
  advance(3);
  edge.record(shop.tenantId, settledMinute(), Math.round(bytes), requests);
  await app.get(MediaBandwidth).runMinute();
}

async function usageOf(shop: ShopClient): Promise<Usage> {
  const result = await shop.get('/media/bandwidth');
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body as Usage;
}

async function setBandwidth(shop: ShopClient, value: string): Promise<void> {
  await admin.query(
    `INSERT INTO control.plan_limit_overrides (tenant_id, limit_key, value, reason, set_by)
     VALUES ($1, 'bandwidth_gb', $2, 'bandwidth test', $3)
     ON CONFLICT (tenant_id, limit_key) DO UPDATE SET value = EXCLUDED.value`,
    [shop.tenantId, value, randomUUID()],
  );
}

async function pulledUntil(): Promise<number> {
  const row = await admin.query<{ pulled_until: Date }>(
    'SELECT pulled_until FROM control.media_usage_pull',
  );
  return row.rows[0]?.pulled_until.getTime() ?? 0;
}

beforeAll(async () => {
  if (!ADMIN_URL) return;
  const urls = await prepareTestDatabase(ADMIN_URL, DB_NAME);
  process.env['DATABASE_URL'] = urls.appDbUrl;
  process.env['OTP_SECRET'] = 'media-bandwidth-e2e-otp-secret-0123456789abcdef';
  process.env['PLATFORM_DOMAIN'] = 'localhost';
  admin = new pg.Client({ connectionString: urls.adminDbUrl });
  await admin.connect();
  // The pass totals from here: just before the first minute a test records.
  await admin.query('UPDATE control.media_usage_pull SET pulled_until = $1', [
    new Date(floorMinute(clockMs) - 5 * MINUTE_MS),
  ]);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(texts.provider)
    .overrideProvider(MEDIA_STORAGE)
    .useValue(new MemoryStorage())
    .overrideProvider(MEDIA_EDGE)
    .useValue(edge)
    .overrideProvider(BANDWIDTH_NOTIFIER)
    .useValue(warnings)
    .overrideProvider(MEDIA_CLOCK)
    .useValue(() => new Date(clockMs))
    .compile();
  ({ app, port } = await listenOn(moduleRef));
});

afterAll(async () => {
  if (!ADMIN_URL) return;
  await app.close();
  await admin.end();
});

describeIfDatabase('media bandwidth (BND-01, BND-02, BND-08)', () => {
  it("adds each shop's settled minutes to its own cycle and day, which total the cycle", async () => {
    const shop = await openShop(port, texts, 'bw-total');
    const other = await openShop(port, texts, 'bw-other');
    expect(await usageOf(shop)).toMatchObject({ usedBytes: 0, requests: 0, days: [] });

    advance(3);
    const first = settledMinute();
    edge.record(shop.tenantId, first, 4_000, 3);
    edge.record(shop.tenantId, new Date(first.getTime() - MINUTE_MS), 1_000, 1);
    edge.record(other.tenantId, first, 9_999, 9);
    await app.get(MediaBandwidth).runMinute();

    const usage = await usageOf(shop);
    expect(usage).toMatchObject({ usedBytes: 5_000, requests: 4 });
    const snapshot = await admin.query<{ gb: number }>(
      "SELECT (plan_snapshot->>'bandwidth_gb')::int AS gb FROM control.tenants WHERE id = $1",
      [shop.tenantId],
    );
    expect(usage.limitBytes).toBe((snapshot.rows[0]?.gb ?? 0) * GB);
    expect(usage.days.reduce((sum, day) => sum + day.bytes, 0)).toBe(usage.usedBytes);
    expect(usage.days.map((day) => day.day)).toContain(dhakaDate(first));
    // DAT-02: the other shop's bytes are its own.
    expect(await usageOf(other)).toMatchObject({ usedBytes: 9_999, requests: 9 });
  });

  it('waits a minute for a minute, and totals each minute once however many passes run', async () => {
    const shop = await openShop(port, texts, 'bw-once');
    advance(3);
    edge.record(shop.tenantId, new Date(floorMinute(clockMs)), 700);
    const pass = app.get(MediaBandwidth);
    await pass.runMinute();
    expect((await usageOf(shop)).usedBytes).toBe(0);

    // Three servers' passes at once: the record of how far usage is totalled is held by one at a time.
    advance(2);
    const now = new Date(clockMs);
    await Promise.all([pass.count(now), pass.count(now), pass.count(now)]);
    await pass.runMinute();
    expect((await usageOf(shop)).usedBytes).toBe(700);
  });

  it('changes nothing while Cloudflare is away, and catches up after', async () => {
    const shop = await openShop(port, texts, 'bw-away');
    edge.down = true;
    const before = await pulledUntil();
    try {
      await serve(shop, 1_234);
      expect(await pulledUntil()).toBe(before);
      expect((await usageOf(shop)).usedBytes).toBe(0);
    } finally {
      edge.down = false;
    }
    await app.get(MediaBandwidth).runMinute();
    expect((await usageOf(shop)).usedBytes).toBe(1_234);
    expect(await pulledUntil()).toBeGreaterThan(before);
  });

  it("splits a cycle's bandwidth by Asia/Dhaka day across midnight", async () => {
    const shop = await openShop(port, texts, 'bw-days');
    // The next Dhaka midnight at least half an hour away, so nothing the pass has totalled is after it.
    let midnight = Math.ceil((clockMs + DHAKA_OFFSET_MS) / DAY_MS) * DAY_MS - DHAKA_OFFSET_MS;
    if (midnight - clockMs < 30 * MINUTE_MS) midnight += DAY_MS;
    edge.record(shop.tenantId, new Date(midnight - 2 * MINUTE_MS), 300);
    edge.record(shop.tenantId, new Date(midnight + MINUTE_MS), 200);
    clockMs = midnight + 3 * MINUTE_MS;
    await app.get(MediaBandwidth).runMinute();

    const usage = await usageOf(shop);
    expect(usage.days).toEqual([
      { day: dhakaDate(new Date(midnight - MINUTE_MS)), bytes: 300, requests: 1 },
      { day: dhakaDate(new Date(midnight)), bytes: 200, requests: 1 },
    ]);
    expect(usage.usedBytes).toBe(500);
  });
});

describeIfDatabase('bandwidth warnings and blocking (BND-03, BND-05, BND-06, MED-10)', () => {
  it('warns at 50, 80 and 95 percent once each, and blocks at 100 percent', async () => {
    const shop = await openShop(port, texts, 'bw-warn');
    await setBandwidth(shop, '1');

    await serve(shop, 0.4 * GB);
    expect(warnings.percentsFor(shop.tenantId)).toEqual([]);
    // Exactly half: 429,496,730 and 107,374,182 bytes.
    await serve(shop, 0.1 * GB);
    expect(warnings.percentsFor(shop.tenantId)).toEqual([50]);
    await serve(shop, 0.05 * GB);
    expect(warnings.percentsFor(shop.tenantId)).toEqual([50]);
    await serve(shop, 0.3 * GB);
    expect(warnings.percentsFor(shop.tenantId)).toEqual([50, 80]);
    await serve(shop, 0.11 * GB);
    expect(warnings.percentsFor(shop.tenantId)).toEqual([50, 80, 95]);
    expect(edge.blocked()[shop.tenantId]).toBeUndefined();

    await serve(shop, 0.05 * GB);
    expect(edge.blocked()[shop.tenantId]).toBe('bandwidth');
    await serve(shop, 0.5 * GB);
    expect(warnings.percentsFor(shop.tenantId)).toEqual([50, 80, 95]);
    expect(warnings.notices.find((notice) => notice.tenantId === shop.tenantId)).toMatchObject({
      limitBytes: GB,
    });
  });

  it('starts a new cycle at zero: unblocked, and warned again (BND-06)', async () => {
    const shop = await openShop(port, texts, 'bw-cycle');
    await setBandwidth(shop, '1');
    await serve(shop, 1.2 * GB);
    expect(edge.blocked()[shop.tenantId]).toBe('bandwidth');

    // A purchase or an upgrade starts a new period (UPG-10).
    const periodStart = new Date(clockMs);
    await admin.query(
      `UPDATE control.tenants SET state = 'active', period_start = $2,
         period_end = $2::timestamptz + interval '30 days'
       WHERE id = $1`,
      [shop.tenantId, periodStart],
    );
    advance(1);
    await app.get(MediaBandwidth).runMinute();
    expect(edge.blocked()[shop.tenantId]).toBeUndefined();
    const fresh = await usageOf(shop);
    expect(fresh).toMatchObject({ usedBytes: 0, requests: 0, days: [] });
    expect(new Date(fresh.cycleStart).getTime()).toBe(periodStart.getTime());

    await serve(shop, 0.6 * GB);
    expect((await usageOf(shop)).usedBytes).toBe(Math.round(0.6 * GB));
    expect(warnings.percentsFor(shop.tenantId)).toEqual([95, 50]);
  });

  it('never blocks or warns an unlimited shop (PLN-19)', async () => {
    const shop = await openShop(port, texts, 'bw-unlimited');
    await setBandwidth(shop, 'null');
    await serve(shop, 50 * GB);
    expect(edge.blocked()[shop.tenantId]).toBeUndefined();
    expect(warnings.percentsFor(shop.tenantId)).toEqual([]);
    expect(await usageOf(shop)).toMatchObject({ usedBytes: 50 * GB, limitBytes: null });
  });

  it('blocks an offline shop as offline, and one also over its bandwidth as bandwidth (LIF-07, LIF-24)', async () => {
    const suspended = await openShop(port, texts, 'bw-suspended');
    const readOnly = await openShop(port, texts, 'bw-readonly');
    const both = await openShop(port, texts, 'bw-both');
    await admin.query('UPDATE control.tenants SET suspended_at = now() WHERE id = ANY($1)', [
      [suspended.tenantId, both.tenantId],
    ]);
    await admin.query("UPDATE control.tenants SET state = 'read_only' WHERE id = $1", [
      readOnly.tenantId,
    ]);
    await setBandwidth(both, '1');
    await serve(both, GB);

    const blocked = edge.blocked();
    expect(blocked[suspended.tenantId]).toBe('offline');
    expect(blocked[readOnly.tenantId]).toBe('offline');
    expect(blocked[both.tenantId]).toBe('bandwidth');

    await admin.query('UPDATE control.tenants SET suspended_at = NULL WHERE id = $1', [
      suspended.tenantId,
    ]);
    await app.get(MediaBandwidth).runMinute();
    expect(edge.blocked()[suspended.tenantId]).toBeUndefined();
  });

  it('keeps a deleted shop blocked, counts nothing more for it, and the day-60 job clears its bandwidth (LIF-19)', async () => {
    const shop = await openShop(port, texts, 'bw-deleted');
    await serve(shop, 800);
    await app.get(MediaEraser).deleteAllForTenant(shop.tenantId);
    await admin.query(
      "UPDATE control.tenants SET state = 'deleted', deleted_at = now() WHERE id = $1",
      [shop.tenantId],
    );
    await serve(shop, 900);

    expect(edge.blocked()[shop.tenantId]).toBe('offline');
    const rows = await admin.query(
      `SELECT 1 FROM control.media_bandwidth WHERE tenant_id = $1
       UNION ALL SELECT 1 FROM control.media_bandwidth_daily WHERE tenant_id = $1`,
      [shop.tenantId],
    );
    expect(rows.rowCount).toBe(0);
  });
});

describeIfDatabase("each shop's website addresses (MED-13)", () => {
  it("writes the shop's own address and its live keys' websites, only when they change", async () => {
    const shop = await openShop(port, texts, 'bw-origins');
    await app.get(MediaBandwidth).runMinute();
    expect(edge.originsOf(shop.tenantId)).toEqual([`http://${shop.slug}.localhost`]);
    await app.get(MediaBandwidth).runMinute();
    expect(edge.originWritesFor(shop.tenantId)).toBe(1);

    const made = await shop.post('/api-keys', {
      name: 'Website',
      websites: ['https://www.myshop.com.bd', 'https://myshop.com.bd'],
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    await app.get(MediaBandwidth).runMinute();
    expect(edge.originsOf(shop.tenantId)).toEqual([
      `http://${shop.slug}.localhost`,
      'https://myshop.com.bd',
      'https://www.myshop.com.bd',
    ]);
    expect(edge.originWritesFor(shop.tenantId)).toBe(2);

    const { id } = made.body as { id: string };
    expect((await shop.post(`/api-keys/${id}/revoke`, {})).status).toBe(200);
    await app.get(MediaBandwidth).runMinute();
    expect(edge.originsOf(shop.tenantId)).toEqual([`http://${shop.slug}.localhost`]);
    expect(edge.originWritesFor(shop.tenantId)).toBe(3);
  });

  it('tries the store again next minute when a write fails', async () => {
    const shop = await openShop(port, texts, 'bw-retry');
    edge.down = true;
    try {
      await app.get(MediaBandwidth).runMinute();
    } finally {
      edge.down = false;
    }
    expect(edge.originsOf(shop.tenantId)).toBeUndefined();
    await app.get(MediaBandwidth).runMinute();
    expect(edge.originsOf(shop.tenantId)).toEqual([`http://${shop.slug}.localhost`]);
  });
});
