import { Inject, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  CircuitBreaker,
  type OpenedCircuit,
  type OutsideCall,
} from '../../../../common/circuit-breaker';
import { RequestContext } from '../../../../common/request-id/request-context';
import { HOUR_MS } from '../../../../common/time';
import { OperatorAlerts } from '../../mail/services/operator-alerts';

/** PRF-05: how often the operators are emailed about one outside service, however many of its circuits open meanwhile. */
export const OUTSIDE_ALERT_EVERY_MS = HOUR_MS;

/** The email the operators get when a service's circuit opens. */
export interface OutsideAlert {
  subject: string;
  body: string;
}

export interface OutsideBreakerOptions {
  /** The breaker's clock, which the hourly alert reads too (the couriers' tests set it). */
  clock?: () => number;
  /** The email's words, where a service's own say more than the default's (the couriers name the shop). */
  alert?: (opened: OpenedCircuit) => OutsideAlert;
}

const defaultAlert = (opened: OpenedCircuit): OutsideAlert => ({
  subject: `Lytro has stopped calling ${opened.service} for now`,
  body:
    `After ${String(opened.failures)} failures in a row on ${opened.circuit}, Lytro stopped calling ` +
    `${opened.service}. It tries once more each minute and carries on when a call works. Another of its circuits ` +
    "opening within the hour isn't emailed; the server's log names each one.",
});

/**
 * PRF-04, PRF-05, D9-17 (Phase 9 Slice 9.5): every outside call's breaker comes from here, so each one is said the same
 * way. Each call is one log line (`service`, `circuit`, `ms`, `outcome`, the names Slice 9.6 reads) and adds to the
 * request's outside time (RequestContext). Each circuit that opens is in the server's log every time, and emailed to the
 * operators at most once an hour for each service. The operators' email is looked up when it's first needed, not
 * injected, because the mail provider's own breaker comes from here too.
 */
@Injectable()
export class OutsideCalls {
  private readonly logger = new Logger('OutsideCalls');
  private readonly alerted = new Map<string, number>();

  constructor(
    @Inject(RequestContext) private readonly requests: RequestContext,
    @Inject(ModuleRef) private readonly modules: ModuleRef,
  ) {}

  /** A breaker for one outside service, or for several told apart by their circuits (the couriers). */
  breaker(
    service: string | ((circuit: string) => string),
    options: OutsideBreakerOptions = {},
  ): CircuitBreaker {
    const clock = options.clock ?? Date.now;
    const words = options.alert ?? defaultAlert;
    return new CircuitBreaker({
      service,
      clock,
      onCall: (call) => {
        this.called(call);
      },
      onOpen: (opened) => {
        this.opened(opened, clock(), words);
      },
    });
  }

  private called(call: OutsideCall): void {
    this.logger.log(
      `outside call service=${call.service} circuit=${call.circuit} ms=${String(call.ms)} outcome=${call.outcome}`,
    );
    // A refused call never went out, so it took none of the request's time.
    if (call.outcome !== 'refused') this.requests.addOutside(call.ms);
  }

  private opened(
    opened: OpenedCircuit,
    now: number,
    words: (opened: OpenedCircuit) => OutsideAlert,
  ): void {
    this.logger.error(
      `the ${opened.service} circuit ${opened.circuit} opened after ${String(opened.failures)} failures in a row`,
    );
    const last = this.alerted.get(opened.service) ?? -OUTSIDE_ALERT_EVERY_MS;
    if (now - last < OUTSIDE_ALERT_EVERY_MS) return;
    this.alerted.set(opened.service, now);
    const { subject, body } = words(opened);
    let operators: OperatorAlerts;
    try {
      operators = this.modules.get(OperatorAlerts, { strict: false });
    } catch (error) {
      this.logger.error('no operator alerts to tell of an opened circuit', error as Error);
      return;
    }
    operators.alert(subject, body).catch((error: unknown) => {
      this.logger.error(
        `could not alert the operators about the ${opened.service} circuit`,
        error as Error,
      );
    });
  }
}
