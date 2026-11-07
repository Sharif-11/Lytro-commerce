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
    return held.map((allowance) => ({
      id: allowance.id,
      left: Math.max(0, allowance.uses - (used.get(allowance.id) ?? 0)),
    }));
  }

  record(tx: Transaction, read: NewOrderExtraction): Promise<void> {
    return this.reads.insert(tx, read);
  }
}
