import { Inject, Injectable } from '@nestjs/common';
import { limitOf, type PlanLimits } from '@lytronix/validators';
import { MINUTE_MS } from '../../../common/time';
import type { Transaction } from '@lytronix/db';
import type { WindowVerdict } from '../../../common/sliding-window';
import type { LimitStore } from '../../shared/limits/ports/limit-store';
import { ExactLimits } from '../../shared/limits/services/exact-limits';
import { LIMIT_STORE } from '../../shared/limits/tokens';

/** A limit as the API applies it: a number, or null for unlimited (PLN-19). */
export type AppliedLimit = number | null;

/**
 * RTE-03, RTE-10: the shop's requests per billing cycle, from its snapshot and overrides. A plan made before this
 * limit existed is held to the Trial plan's (PLN-19's table); every seeded plan and snapshot carries it (migration 0064).
 */
export function monthlyLimit(limits: PlanLimits | null): AppliedLimit {
  return limitOf(limits, 'requests_monthly');
}

/**
 * RTE-06, D3-2, D9-15 (Slice 9.4): the per-minute windows on the public API, one count for every API copy and server.
 * A visitor's requests, sign-ins and tracking reads in the shared limit store (Redis; half each per process while it's
 * down); a visitor's orders, every shopper's orders and payment sessions in a shop, and a visitor's sign-up codes
 * exact, in PostgreSQL (RED-11). A public key has no window of its own (KNOWN-GAPS §82).
 */
@Injectable()
export class RequestLimits {
  constructor(
    @Inject(LIMIT_STORE) private readonly store: LimitStore,
    @Inject(ExactLimits) private readonly exact: ExactLimits,
  ) {}

  /** RTE-06: one visitor's requests to one shop. */
  perVisitor(tenantId: string, ip: string, limit: number, now: Date): Promise<WindowVerdict> {
    return this.store.take(`ip:${tenantId}:${ip}`, limit, MINUTE_MS, now);
  }

  /** RTE-06, LND-12, RED-11: one visitor's orders in one shop, exact. */
  ordersPerVisitor(tenantId: string, ip: string, limit: number, now: Date): Promise<WindowVerdict> {
    return this.exact.take(`order-ip:${tenantId}:${ip}`, limit, MINUTE_MS, now);
  }

  /** RTE-08 (amended 2026-10-30), RED-11: every shopper's orders in one shop together, a flood guard, exact. */
  ordersPerShop(tenantId: string, limit: number, now: Date): Promise<WindowVerdict> {
    return this.exact.take(`order-shop:${tenantId}`, limit, MINUTE_MS, now);
  }

  /**
   * RTE-08 (amended 2026-10-31), RED-11: every shopper's payment sessions in one shop together, a flood guard, exact;
   * counted in the order's own transaction, so an order that fails counts no session.
   */
  sessionsPerShop(
    tenantId: string,
    limit: number,
    now: Date,
    tx?: Transaction,
  ): Promise<WindowVerdict> {
    return this.exact.take(`session-shop:${tenantId}`, limit, MINUTE_MS, now, tx);
  }

  /** RTE-06, CUS-04, RED-11: one visitor's sign-up code requests in one shop, exact. */
  codesPerVisitor(tenantId: string, ip: string, limit: number, now: Date): Promise<WindowVerdict> {
    return this.exact.take(`code-ip:${tenantId}:${ip}`, limit, MINUTE_MS, now);
  }

  /** CUS-03: one visitor's sign-up and sign-in attempts in one shop. */
  signinsPerVisitor(
    tenantId: string,
    ip: string,
    limit: number,
    now: Date,
  ): Promise<WindowVerdict> {
    return this.store.take(`signin-ip:${tenantId}:${ip}`, limit, MINUTE_MS, now);
  }

  /** ORD-17: one visitor's tracking reads in one shop. */
  trackingPerVisitor(
    tenantId: string,
    ip: string,
    limit: number,
    now: Date,
  ): Promise<WindowVerdict> {
    return this.store.take(`track-ip:${tenantId}:${ip}`, limit, MINUTE_MS, now);
  }
}
