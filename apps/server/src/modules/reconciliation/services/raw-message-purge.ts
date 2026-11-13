import { Inject, Injectable, Logger } from '@nestjs/common';
import { RAW_MESSAGE_KEPT_DAYS } from '@lytronix/validators';
import { DAY_MS } from '../../../common/time';
import type { ReconciliationStore } from '../ports/reconciliation-store';
import { RECONCILIATION_CLOCK, RECONCILIATION_STORE } from '../tokens';

/** What one night's clean-up removed. */
export interface RawMessagePurgeResult {
  gatewayAnswers: number;
  courierMessages: number;
}

/**
 * DAT-51, D9-16 (Phase 9 Slice 9.5, the user 2026-11-13): couriers' messages and gateways' answers kept as they arrived are
 * removed once [90] days old (RAW_MESSAGE_KEPT_DAYS). Lytro's own table in one statement; a shop's messages in its own
 * context, one shop at a time, one shop's failure never stopping the rest.
 */
@Injectable()
export class RawMessagePurge {
  private readonly logger = new Logger('RawMessagePurge');

  constructor(
    @Inject(RECONCILIATION_STORE) private readonly store: ReconciliationStore,
    @Inject(RECONCILIATION_CLOCK) private readonly clock: () => Date,
  ) {}

  async run(now = this.clock()): Promise<RawMessagePurgeResult> {
    const before = new Date(now.getTime() - RAW_MESSAGE_KEPT_DAYS * DAY_MS);
    const result: RawMessagePurgeResult = {
      gatewayAnswers: await this.store.purgeGatewayAnswers(before),
      courierMessages: 0,
    };
    for (const shopId of await this.store.shops()) {
      try {
        result.courierMessages += await this.store.inShop((tx) =>
          this.store.purgeCourier(tx, shopId, before),
        );
      } catch (error) {
        this.logger.error(
          `raw courier messages couldn't be removed for tenant ${shopId}`,
          error as Error,
        );
      }
    }
    return result;
  }
}
