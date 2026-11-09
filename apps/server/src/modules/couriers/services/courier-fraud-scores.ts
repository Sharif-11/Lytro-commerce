import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CourierAdapterState,
  CourierCallAction,
  FraudSourceState,
  type CourierKey,
} from '@lytronix/validators';
import type { CourierFraudFigures } from '../ports/courier-adapter';
import type { CourierStore } from '../ports/courier-store';
import { COURIER_STORE } from '../tokens';
import { CourierCalls } from './courier-calls';
import { CourierConnections } from './courier-connections';

/** FRD-11: what one courier did for a fraud check. */
export type CourierFraudScore =
  | { state: FraudSourceState.Answered; figures: CourierFraudFigures }
  | { state: FraudSourceState.NotConnected | FraudSourceState.Failed };

/**
 * FRD-01, FRD-11, D7-45, D7-46 (Phase 7 Slice 7.5, read agreed 2026-11-07): a courier's record of a phone, asked through
 * the shop's own live connection and nothing else -- never Lytro's key, never another shop's. A shop without one, or a
 * courier the operator removed (CRR-24), or one with no check, is "not connected". The call goes through CourierCalls, so
 * it has the shop's circuit for that courier and a line in its log (CRR-26, SEC-11). A refusal, a timeout or an answer
 * that can't be read is a failure, which the check notes and goes on without (FRD-11). The phone is never logged.
 */
@Injectable()
export class CourierFraudScores {
  private readonly logger = new Logger(CourierFraudScores.name);

  constructor(
    @Inject(COURIER_STORE) private readonly store: CourierStore,
    @Inject(CourierConnections) private readonly connections: CourierConnections,
    @Inject(CourierCalls) private readonly calls: CourierCalls,
  ) {}

  /** D7-46: whether the shop has this courier connected for checks, as a live answer would need. */
  async connected(tenantId: string, courierKey: CourierKey): Promise<boolean> {
    const opened = await this.opened(tenantId, courierKey);
    return opened?.adapter.fraudScore !== undefined;
  }

  private opened(tenantId: string, courierKey: CourierKey) {
    return this.store.run(tenantId, async (tx) =>
      (await this.store.adapterStateWithin(tx, courierKey)) === CourierAdapterState.Removed
        ? null
        : this.connections.openedWithin(tx, tenantId, courierKey),
    );
  }

  async scoreOf(
    tenantId: string,
    courierKey: CourierKey,
    phone: string,
    orderId: string | null,
  ): Promise<CourierFraudScore> {
    const opened = await this.opened(tenantId, courierKey);
    const ask = opened?.adapter.fraudScore?.bind(opened.adapter);
    if (!opened || !ask) return { state: FraudSourceState.NotConnected };
    try {
      const answer = await this.calls.run(
        opened.adapter,
        {
          tenantId,
          connectionId: opened.account.connectionId,
          orderId,
          action: CourierCallAction.FraudCheck,
        },
        () => ask(opened.account, phone),
      );
      if (answer.outcome === 'answered') {
        return { state: FraudSourceState.Answered, figures: answer.figures };
      }
      this.logger.warn(`${courierKey} refused a fraud check for tenant ${tenantId}`);
    } catch (error) {
      this.logger.warn(
        `${courierKey} gave no fraud check answer for tenant ${tenantId}: ${(error as Error).name}`,
      );
    }
    return { state: FraudSourceState.Failed };
  }
}
