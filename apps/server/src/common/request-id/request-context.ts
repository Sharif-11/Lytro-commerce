import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

/**
 * API-27 (Phase 8 Slice 8.1): the request a piece of work is serving, so a log line written anywhere while it runs
 * carries that request's ID without every caller passing it along.
 */
@Injectable()
export class RequestContext {
  private readonly store = new AsyncLocalStorage<{ requestId: string }>();

  run<T>(requestId: string, work: () => T): T {
    return this.store.run({ requestId }, work);
  }

  /** The current request's ID, or undefined outside a request (start-up, a queue job). */
  requestId(): string | undefined {
    return this.store.getStore()?.requestId;
  }
}
