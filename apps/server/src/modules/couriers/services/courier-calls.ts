import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CourierCallAction } from '@lytronix/validators';
import { CircuitBreaker } from '../../../common/circuit-breaker';
import type { CourierAdapter } from '../ports/courier-adapter';
import type { CourierStore } from '../ports/courier-store';
import { COURIER_CLOCK, COURIER_STORE } from '../tokens';

/** Whose credentials a call runs on, and what it serves, for the log. */
export interface CourierCallContext {
  tenantId: string;
  /** Null for the test of credentials not yet saved. */
  connectionId: string | null;
  orderId: string | null;
  action: CourierCallAction;
}

/**
 * CRR-26, SEC-11, PRF-05 (Phase 6 Slice 6.1): every call to a courier goes through here: a circuit per shop per courier, so one shop's
 * bad day with a courier never reaches another shop or another courier, and a line in the shop's log whether the call worked or
 * not, never with a credential. A courier's refusal is an answer, not a failure of the courier, so it doesn't count toward the
 * circuit. A call the open circuit refused was never made, so it isn't logged. The log failing changes nothing.
 */
@Injectable()
export class CourierCalls {
  private readonly logger = new Logger('CourierCalls');
  private readonly breaker: CircuitBreaker;

  constructor(
    @Inject(COURIER_STORE) private readonly store: CourierStore,
    @Inject(COURIER_CLOCK) private readonly clock: () => Date,
  ) {
    this.breaker = new CircuitBreaker(() => this.clock().getTime());
  }

  async run<T extends { outcome: string }>(
    adapter: Pick<CourierAdapter, 'key'>,
    context: CourierCallContext,
    work: () => Promise<T>,
  ): Promise<T> {
    const call = { made: false, succeeded: false };
    try {
      const answer = await this.breaker.call(`${context.tenantId}:${adapter.key}`, () => {
        call.made = true;
        return work();
      });
      call.succeeded = answer.outcome !== 'refused';
      return answer;
    } finally {
      if (call.made) await this.log(adapter, context, call.succeeded);
    }
  }

  private async log(
    adapter: Pick<CourierAdapter, 'key'>,
    context: CourierCallContext,
    succeeded: boolean,
  ): Promise<void> {
    try {
      await this.store.recordUse(context.tenantId, {
        courierKey: adapter.key,
        action: context.action,
        connectionId: context.connectionId,
        orderId: context.orderId,
        succeeded,
        at: this.clock(),
      });
    } catch (error) {
      this.logger.error(`could not log a courier call for ${context.tenantId}`, error as Error);
    }
  }
}
