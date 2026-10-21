import { describe, expect, it } from 'vitest';
import { QueueName } from '@lytronix/validators';
import { LifecycleTickWorker } from '../src/modules/shared/queue-workers/services/lifecycle-tick-worker';
import type { DowngradeService } from '../src/modules/billing/services/downgrade.service';
import type { LifecycleService } from '../src/modules/billing/services/lifecycle.service';
import type { TrialLifecycleService } from '../src/modules/billing/services/trial-lifecycle.service';
import type { PlanPaymentsService } from '../src/modules/payments/services/plan-payments.service';
import type { PgBossClient } from '../src/modules/shared/queue/services/pg-boss-client';

// This worker is the one thing standing between TrialLifecycleService.convertExpiredTrials()/
// DowngradeService.applyDueChanges() being correct in isolation and actually running in production -- the
// exact gap found 2026-10-16 (KNOWN-GAPS.md #10 and its downgrade-apply sibling). A fake PgBoss client lets
// the registered work handler be invoked directly, with no real queue or database, the same fake-dependency
// style test/adapters.spec.ts already uses for adapters.
function fakePgBoss(): {
  client: PgBossClient;
  calls: string[];
  runWork: () => Promise<void>;
} {
  const calls: string[] = [];
  let handler: (() => Promise<void>) | null = null;
  const boss = {
    createQueue: (name: string) => {
      calls.push(`createQueue:${name}`);
      return Promise.resolve();
    },
    schedule: (name: string, cron: string) => {
      calls.push(`schedule:${name}:${cron}`);
      return Promise.resolve();
    },
    work: (name: string, fn: () => Promise<void>) => {
      calls.push(`work:${name}`);
      handler = fn;
      return Promise.resolve();
    },
  };
  return {
    client: { boss } as unknown as PgBossClient,
    calls,
    runWork: async () => {
      if (!handler) throw new Error('no work handler was registered');
      await handler();
    },
  };
}

describe('LifecycleTickWorker (D2-6)', () => {
  it('registers the real lifecycle-tick queue on the documented 5-minute cron', async () => {
    const { client, calls } = fakePgBoss();
    const lifecycle = { runTick: () => Promise.resolve() } as unknown as LifecycleService;
    const trials = {
      convertExpiredTrials: () => Promise.resolve(0),
    } as unknown as TrialLifecycleService;
    const downgrade = { applyDueChanges: () => Promise.resolve(0) } as unknown as DowngradeService;
    const planPayments = {
      expireStalePending: () => Promise.resolve(0),
    } as unknown as PlanPaymentsService;
    const worker = new LifecycleTickWorker(client, lifecycle, trials, downgrade, planPayments);

    await worker.onModuleInit();

    expect(calls).toEqual([
      `createQueue:${QueueName.LifecycleTick}`,
      `schedule:${QueueName.LifecycleTick}:*/5 * * * *`,
      `work:${QueueName.LifecycleTick}`,
    ]);
  });

  it('calls trial conversion, due downgrades, their final warnings, the lifecycle tick and the payment sweep every time the queue fires (TRL-01/07, DWN-06/08/14/15/17, BIL-15)', async () => {
    const { client, runWork } = fakePgBoss();
    const order: string[] = [];
    const lifecycle = {
      runTick: () => {
        order.push('lifecycle');
        return Promise.resolve({ transitioned: 0, warningsSent: 0, deleted: 0 });
      },
    } as unknown as LifecycleService;
    const trials = {
      convertExpiredTrials: () => {
        order.push('trials');
        return Promise.resolve(0);
      },
    } as unknown as TrialLifecycleService;
    const downgrade = {
      applyDueChanges: () => {
        order.push('downgrade');
        return Promise.resolve(0);
      },
      sendFinalWarnings: () => {
        order.push('downgrade-final-warnings');
        return Promise.resolve(0);
      },
    } as unknown as DowngradeService;
    const planPayments = {
      expireStalePending: () => {
        order.push('payment-sweep');
        return Promise.resolve(0);
      },
    } as unknown as PlanPaymentsService;
    const worker = new LifecycleTickWorker(client, lifecycle, trials, downgrade, planPayments);

    await worker.onModuleInit();
    await runWork();

    expect(order).toEqual([
      'trials',
      'downgrade',
      'downgrade-final-warnings',
      'lifecycle',
      'payment-sweep',
    ]);
  });
});
