import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { PlanLimits } from '@lytronix/validators';
import { MINUTE_MS } from '../../../common/time';
import { SlidingWindow, type WindowVerdict } from './sliding-window';

// RTE-06: a visitor's requests a minute to one shop through its public keys, whatever the shop's plan allows.
export const PUBLIC_REQUESTS_PER_IP_PER_MINUTE = 120;

// PLN-19: a limit a plan does not set falls back to the consumer's own figure. A plan an operator made before these
// limits existed is held to the Trial plan's (2.1) until the operator sets its own; every seeded plan and every
// shop's snapshot carries them (migration 0064).
const NOT_SET = { perMinute: 60, monthly: 20_000 };

/** A limit as the API applies it: a number, or null for unlimited (PLN-19). */
export type AppliedLimit = number | null;

/** RTE-01, RTE-10: the shop's per-minute limit for a public key, from its snapshot and overrides. */
export function perMinuteLimit(limits: PlanLimits | null): AppliedLimit {
  const value = limits?.requests_per_minute_public;
  return value === undefined ? NOT_SET.perMinute : value;
}

/** RTE-03, RTE-10: the shop's requests per billing cycle, from its snapshot and overrides. */
export function monthlyLimit(limits: PlanLimits | null): AppliedLimit {
  const value = limits?.requests_monthly;
  return value === undefined ? NOT_SET.monthly : value;
}

// How often the windows drop buckets nobody is using.
const SWEEP_EVERY_MS = MINUTE_MS;

/**
 * RTE-01, RTE-06, D3-2: the per-minute limits, in memory: each public key's own sliding window, and each visitor's
 * across one shop's keys. Exact while there is one server; Phase 9 moves them to the shared Redis behind these calls.
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
  perVisitor(tenantId: string, ip: string, now: Date): WindowVerdict {
    return this.windows.take(
      `ip:${tenantId}:${ip}`,
      PUBLIC_REQUESTS_PER_IP_PER_MINUTE,
      now.getTime(),
    );
  }

  /** RTE-01: one key's requests. */
  perKey(keyId: string, limit: number, now: Date): WindowVerdict {
    return this.windows.take(`key:${keyId}`, limit, now.getTime());
  }
}
