import { Inject, Injectable, Logger } from '@nestjs/common';
import { CourierCallAction } from '@lytronix/validators';
import type { CircuitBreaker, OpenedCircuit } from '../../../common/circuit-breaker';
import { OutsideCalls, type OutsideAlert } from '../../shared/outside-calls/services/outside-calls';
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

/** A courier circuit is `<shop>:<courier>`, with `:fraud` after it for fraud checks (FRD-11); the service is the courier. */
const courierOf = (circuit: string): string => circuit.split(':')[1] ?? circuit;

/** PRF-05: the operators' email when a courier's circuit opens, naming the shop it opened for. */
const courierAlert = (opened: OpenedCircuit): OutsideAlert => ({
  subject: `A courier's calls have stopped: ${opened.service}`,
  body:
    `After ${String(opened.failures)} failures in a row, Lytro stopped calling ${opened.service} for shop ` +
    `${opened.circuit.split(':')[0] ?? opened.circuit}. It tries once more each minute and carries on when a call ` +
    "works. Other shops or a later outage of this courier within the hour aren't emailed; the server's log names each one.",
});

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
    @Inject(OutsideCalls) outside: OutsideCalls,
  ) {
    // PRF-05 (Slice 9.5): the shared breaker says each call and each opened circuit as every outside call's does, and
    // emails the operators once an hour for each courier, however many shops' circuits open while it's down.
    this.breaker = outside.breaker(courierOf, {
      clock: () => this.clock().getTime(),
      alert: courierAlert,
    });
  }

  async run<T extends { outcome: string }>(
    adapter: Pick<CourierAdapter, 'key'>,
    context: CourierCallContext,
    work: () => Promise<T>,
  ): Promise<T> {
    const call = { made: false, succeeded: false };
    try {
      // A fraud check that keeps failing leaves the shop's bookings alone (FRD-11).
      const purpose = context.action === CourierCallAction.FraudCheck ? ':fraud' : '';
      const answer = await this.breaker.call(`${context.tenantId}:${adapter.key}${purpose}`, () => {
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
