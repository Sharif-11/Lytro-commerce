import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import { StorefrontActivation } from '../../balance/services/storefront-activation';
import { OrderAccessSteps } from '../../orders/services/order-access-steps';

/**
 * PYG-24, PYG-25 (PAYG-FAIR-USE-PLAN PF-13, PF-33): what a plan starting means for pay-as-you-go fair use, in the
 * plan's own transaction. Every order the shop hadn't opened is opened free -- the plan covers them -- and a plan paid
 * for activates the storefront for good, so a later move to pay-as-you-go never pauses it.
 */
@Injectable()
export class PlanStarted {
  constructor(
    @Inject(OrderAccessSteps) private readonly orders: OrderAccessSteps,
    @Inject(StorefrontActivation) private readonly activation: StorefrontActivation,
  ) {}

  async within(tx: Transaction, tenantId: string, paid: boolean, now: Date): Promise<void> {
    await this.orders.openAllWithin(tx, tenantId);
    if (paid) await this.activation.planPaidWithin(tx, tenantId, now);
  }
}
