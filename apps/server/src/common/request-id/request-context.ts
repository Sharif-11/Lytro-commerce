import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

/** PRF-04, D9-17 (Slice 9.5): the time a request spent waiting on outside services, and how many calls it made. */
export interface OutsideTime {
  outsideMs: number;
  outsideCalls: number;
}

/** One request's state, as its log lines read it. */
export interface RequestState extends OutsideTime {
  requestId: string;
  /** LOG-01 (Slice 9.6): the shop the request is for, once a guard has found it (ShopLogContext). */
  shopId?: string;
}

/**
 * API-27 (Phase 8 Slice 8.1): the request a piece of work is serving, so a log line written anywhere while it runs
 * carries that request's ID without every caller passing it along. PRF-04 (Slice 9.5): it also sums the request's time
 * spent waiting on outside services, which Slice 9.6's request line reads from here, so a request's own time is its
 * total less `outsideMs`.
 */
@Injectable()
export class RequestContext {
  private readonly store = new AsyncLocalStorage<RequestState>();

  run<T>(requestId: string, work: () => T): T {
    return this.store.run({ requestId, outsideMs: 0, outsideCalls: 0 }, work);
  }

  /**
   * The current request's own state, for what reads it after the request's work is done (its request line, Slice 9.6),
   * when this context is gone; undefined outside a request.
   */
  current(): Readonly<RequestState> | undefined {
    return this.store.getStore();
  }

  /** LOG-01 (Slice 9.6): the shop the current request is for, from the guard that found it; outside a request, nothing. */
  setShop(shopId: string | null): void {
    const state = this.store.getStore();
    if (state && shopId !== null) state.shopId = shopId;
  }

  /** The current request's shop, or undefined outside a request or before a guard found one. */
  shopId(): string | undefined {
    return this.store.getStore()?.shopId;
  }

  /** The current request's ID, or undefined outside a request (start-up, a queue job). */
  requestId(): string | undefined {
    return this.store.getStore()?.requestId;
  }

  /** PRF-04: adds one outside call that went out to the request it serves; outside a request, nothing. */
  addOutside(ms: number): void {
    const state = this.store.getStore();
    if (!state) return;
    state.outsideMs += ms;
    state.outsideCalls += 1;
  }

  /** PRF-04: the current request's outside time so far, or undefined outside a request. */
  outside(): OutsideTime | undefined {
    const state = this.store.getStore();
    return state ? { outsideMs: state.outsideMs, outsideCalls: state.outsideCalls } : undefined;
  }
}
