import { describe, expect, it } from 'vitest';
import { QueueName } from '@lytronix/validators';
import type { ListenerDevices } from '../src/modules/listener/services/listener-devices';
import type { ListenerReceipts } from '../src/modules/listener-receipts/services/listener-receipts';
import type { PgBossClient } from '../src/modules/shared/queue/services/pg-boss-client';
import { ListenerPurgeTickWorker } from '../src/modules/shared/queue-workers/services/listener-purge-tick-worker';

// LSN-05: the listener's daily purge runs in the quiet hours of Asia/Dhaka. Found at the Phase 5 close-out: its schedule
// named no time zone, so pg-boss read 03:23 as UTC, which is 09:23 in Dhaka.
describe('the listener purge (LSN-05)', () => {
  it('is scheduled at 03:23 in Asia/Dhaka, and each run purges and redacts', async () => {
    const scheduled: { name: string; cron: string; options: unknown }[] = [];
    const registered: { handler: (() => Promise<void>) | null } = { handler: null };
    const boss = {
      createQueue: () => Promise.resolve(),
      schedule: (name: string, cron: string, _data: unknown, options?: unknown) => {
        scheduled.push({ name, cron, options });
        return Promise.resolve();
      },
      work: (_name: string, fn: () => Promise<void>) => {
        registered.handler = fn;
        return Promise.resolve();
      },
    };
    const ran: string[] = [];
    const devices = {
      purge: () => {
        ran.push('purge');
        return Promise.resolve({ codes: 0, devices: 0 });
      },
    } as unknown as ListenerDevices;
    const receipts = {
      redactOld: () => {
        ran.push('redact');
        return Promise.resolve({ redacted: 0, removed: 0 });
      },
    } as unknown as ListenerReceipts;
    const worker = new ListenerPurgeTickWorker(
      { boss } as unknown as PgBossClient,
      devices,
      receipts,
    );
    await worker.onModuleInit();
    expect(scheduled).toEqual([
      { name: QueueName.ListenerPurgeTick, cron: '23 3 * * *', options: { tz: 'Asia/Dhaka' } },
    ]);
    if (!registered.handler) throw new Error('no work handler was registered');
    await registered.handler();
    expect(ran).toEqual(['purge', 'redact']);
  });
});
