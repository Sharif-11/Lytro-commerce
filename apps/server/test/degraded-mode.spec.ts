import { describe, expect, it, vi } from 'vitest';
import { PlatformSettingKey, QueueName } from '@lytronix/validators';
import { HOUR_MS, MINUTE_MS } from '../src/common/time';
import { DegradedMode } from '../src/modules/degraded-mode/services/degraded-mode';
import type { PlatformSettingsService } from '../src/modules/platform-settings/services/platform-settings.service';
import { SharedLimitStore } from '../src/modules/shared/limits/services/shared-limit-store';
import {
  PAUSED_JOB_WAIT_SECONDS,
  PgBossClient,
} from '../src/modules/shared/queue/services/pg-boss-client';

// DAT-38, D9-14 (Phase 9 Slice 9.5's read, 2026-11-13: "rate limits ÷2"): degraded mode divides only per-minute rate
// limits, by the operator's factor, and holds back only the heavy queues.
function modeWith(values: Partial<Record<PlatformSettingKey, unknown>>): DegradedMode {
  const settings = {
    current: (key: PlatformSettingKey) =>
      Promise.resolve(key in values ? { key, value: values[key] } : null),
  } as unknown as PlatformSettingsService;
  return new DegradedMode(settings);
}

const ON = { [PlatformSettingKey.DegradedMode]: { on: true, noticeId: null } };
const outage = { down: () => Promise.resolve(), up: () => Promise.resolve() };

async function allowedOf(store: SharedLimitStore, windowMs: number, limit = 4): Promise<number> {
  const bucket = `ip:shop:${String(windowMs)}:${String(Math.random())}`;
  let allowed = 0;
  for (let index = 0; index < limit; index += 1) {
    if ((await store.take(bucket, limit, windowMs, new Date())).allowed) allowed += 1;
  }
  return allowed;
}

describe('degraded mode (DAT-38, D9-14)', () => {
  it('is off until the operator turns it on; on, a minute or less is divided by the factor, 2 unless set', async () => {
    expect(await modeWith({}).divisor(MINUTE_MS)).toBe(1);
    expect(await modeWith(ON).divisor(MINUTE_MS)).toBe(2);
    expect(await modeWith(ON).divisor(10_000)).toBe(2);
    // Longer windows (sign-in codes an hour) are never divided.
    expect(await modeWith(ON).divisor(HOUR_MS)).toBe(1);
    expect(
      await modeWith({ ...ON, [PlatformSettingKey.DegradedFactor]: 4 }).divisor(MINUTE_MS),
    ).toBe(4);
  });

  it('holds back only the heavy queues, and only while on', async () => {
    const on = modeWith(ON);
    expect(await on.pauses(QueueName.DataExport)).toBe(true);
    expect(await on.pauses(QueueName.MetaPurchase)).toBe(true);
    expect(await on.pauses(QueueName.Sms)).toBe(false);
    expect(await on.pauses(QueueName.GatewayReconcileTick)).toBe(false);
    expect(await modeWith({}).pauses(QueueName.DataExport)).toBe(false);
  });

  it('halves a per-minute limit in the one store while on, and leaves an hour alone', async () => {
    const store = new SharedLimitStore(null, outage, modeWith(ON));
    store.onModuleInit();
    try {
      expect(await allowedOf(store, MINUTE_MS)).toBe(2);
      expect(await allowedOf(store, HOUR_MS)).toBe(4);
    } finally {
      store.onModuleDestroy();
    }
    const off = new SharedLimitStore(null, outage, modeWith({}));
    off.onModuleInit();
    try {
      expect(await allowedOf(off, MINUTE_MS)).toBe(4);
    } finally {
      off.onModuleDestroy();
    }
  });

  it('puts a held-back job back for later instead of running it, and runs it when off', async () => {
    for (const on of [true, false]) {
      const client = new PgBossClient(
        { DATABASE_URL: 'postgres://nobody@localhost/none', SERVER_ROLE: 'api' },
        undefined,
        { pauses: () => Promise.resolve(on) },
      );
      let worker: ((jobs: { data: object }[]) => Promise<void>) | undefined;
      vi.spyOn(client.boss, 'work').mockImplementation(((
        _name: string,
        handler: (jobs: { data: object }[]) => Promise<void>,
      ) => {
        worker = handler;
        return Promise.resolve('worker');
      }) as never);
      const send = vi.spyOn(client.boss, 'send').mockResolvedValue('again');
      const handler = vi.fn(() => Promise.resolve());
      await client.workPausable(QueueName.DataExport, handler);
      await worker?.([{ data: { exportId: 'e1', tenantId: 't1' } }]);
      if (on) {
        expect(handler).not.toHaveBeenCalled();
        expect(send).toHaveBeenCalledWith(
          QueueName.DataExport,
          { exportId: 'e1', tenantId: 't1' },
          { startAfter: PAUSED_JOB_WAIT_SECONDS },
        );
      } else {
        expect(handler).toHaveBeenCalledTimes(1);
        expect(send).not.toHaveBeenCalled();
      }
    }
  });
});
