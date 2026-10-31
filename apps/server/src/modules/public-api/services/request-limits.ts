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

  /** RTE-06, LND-12: one visitor's orders in one shop. */
  ordersPerVisitor(tenantId: string, ip: string, limit: number, now: Date): WindowVerdict {
    return this.windows.take(`order-ip:${tenantId}:${ip}`, limit, now.getTime());
  }

  /** RTE-08 (amended 2026-10-30): every shopper's orders in one shop together, a flood guard. */
  ordersPerShop(tenantId: string, limit: number, now: Date): WindowVerdict {
    return this.windows.take(`order-shop:${tenantId}`, limit, now.getTime());
  }

  /** RTE-08 (amended 2026-10-31): every shopper's payment sessions in one shop together, a flood guard. */
  sessionsPerShop(tenantId: string, limit: number, now: Date): WindowVerdict {
    return this.windows.take(`session-shop:${tenantId}`, limit, now.getTime());
  }

  /** RTE-06, CUS-04: one visitor's sign-up code requests in one shop. */
  codesPerVisitor(tenantId: string, ip: string, limit: number, now: Date): WindowVerdict {
    return this.windows.take(`code-ip:${tenantId}:${ip}`, limit, now.getTime());
  }

  /** CUS-03: one visitor's sign-up and sign-in attempts in one shop. */
  signinsPerVisitor(tenantId: string, ip: string, limit: number, now: Date): WindowVerdict {
    return this.windows.take(`signin-ip:${tenantId}:${ip}`, limit, now.getTime());
  }

  /** ORD-17: one visitor's tracking reads in one shop. */
  trackingPerVisitor(tenantId: string, ip: string, limit: number, now: Date): WindowVerdict {
    return this.windows.take(`track-ip:${tenantId}:${ip}`, limit, now.getTime());
  }
}
