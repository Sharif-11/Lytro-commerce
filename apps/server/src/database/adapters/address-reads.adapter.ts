import { Inject, Injectable } from '@nestjs/common';
import {
  AddonPurchaseRepository,
  OrderExtractionRepository,
  type NewOrderExtraction,
  type Transaction,
} from '@lytronix/db';
import { AllowanceService } from '@lytronix/validators';
import type {
  AddressReadStore,
  AllowanceLeft,
} from '../../modules/address-reads/ports/address-read-store';

/** tenant.order_extractions, and the address-read allowances in control.addon_purchases (ORD-34, PLN-20). */
@Injectable()
export class DrizzleAddressReadStore implements AddressReadStore {
  constructor(
    @Inject(OrderExtractionRepository) private readonly reads: OrderExtractionRepository,
    @Inject(AddonPurchaseRepository) private readonly purchases: AddonPurchaseRepository,
  ) {}

  async allowancesFor(tx: Transaction, tenantId: string): Promise<AllowanceLeft[]> {
    const held = await this.purchases.countingAllowancesForUpdate(
      tx,
      tenantId,
      AllowanceService.AddressReads,
    );
    const used = await this.reads.usesOf(
      tx,
      tenantId,
      held.map((allowance) => allowance.id),
    );
    return held.map((allowance) => {
      const taken = used.get(allowance.id) ?? 0;
      return {
        id: allowance.id,
        total: allowance.uses,
        used: taken,
        left: Math.max(0, allowance.uses - taken),
        expiresAt: allowance.expiresAt,
      };
    });
  }

  paidFromBalanceSince(
    tx: Transaction,
    tenantId: string,
    since: Date,
  ): Promise<{ count: number; cost: string }> {
    return this.reads.paidFromBalanceSince(tx, tenantId, since);
  }

  record(tx: Transaction, read: NewOrderExtraction): Promise<void> {
    return this.reads.insert(tx, read);
  }
}
