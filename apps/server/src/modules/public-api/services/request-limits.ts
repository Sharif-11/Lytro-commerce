import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { limitOf, type PlanLimits } from '@lytronix/validators';
import { MINUTE_MS } from '../../../common/time';
import { SlidingWindow, type WindowVerdict } from '../../../common/sliding-window';

/** A limit as the API applies it: a number, or null for unlimited (PLN-19). */
export type AppliedLimit = number | null;

/**
 * RTE-03, RTE-10: the shop's requests per billing cycle, from its snapshot and overrides. A plan made before this
 * limit existed is held to the Trial plan's (PLN-19's table); every seeded plan and snapshot carries it (migration 0064).
 */
export function monthlyLimit(limits: PlanLimits | null): AppliedLimit {
  return limitOf(limits, 'requests_monthly');
}

// How often the windows drop buckets nobody is using.
const SWEEP_EVERY_MS = MINUTE_MS;

/**
 * RTE-06, D3-2: the per-minute limit, in memory: each visitor's sliding window across one shop's keys. A public key
 * has no window of its own (KNOWN-GAPS §82). Exact while there is one server; Phase 9 moves the windows to the shared
 * Redis behind these calls.
 */
@Injectable()
export class RequestLimits implements OnModuleInit, OnModuleDestroy {
  private readonly windows = new SlidingWindow(MINUTE_MS);
  private sweeper: NodeJS.Timeout | null = null;

  onModuleInit(): void {
    this.sweeper = setInterval(() => {
      this.windows.sweep(Date.now());
    }, SWEEP_EVERY_MS);
    this.sweeper.unref();
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  /** RTE-06: one visitor's requests to one shop. */
  perVisitor(tenantId: string, ip: string, limit: number, now: Date): WindowVerdict {
    return this.windows.take(`ip:${tenantId}:${ip}`, limit, now.getTime());
  }
}
