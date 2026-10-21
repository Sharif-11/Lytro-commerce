import { Inject, Injectable } from '@nestjs/common';
import {
  AddonPurchaseRepository,
  AddonRepository,
  TransactionRunner,
  type Transaction,
} from '@lytronix/db';
import { UniqueViolation } from '../../common/errors/unique-violation';
import type { AddonsStore } from '../../modules/billing/ports/addons-store';
import type {
  ActiveAddon,
  AddonEdit,
  AddonPurchaseRecord,
  AddonRecord,
  AddonUnits,
  NewAddonPurchaseValues,
  NewAddonValues,
} from '../../modules/billing/types/addon';
import { DatabaseService } from '../database.service';

// PLN-13: an add-on's key names it everywhere, so no two share one.
const ADDON_KEY_INDEX = 'addons_key_unique';

/** control.addons and control.addon_purchases (PLN-13, PLN-14). */
@Injectable()
export class DrizzleAddonsStore implements AddonsStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(AddonRepository) private readonly addons: AddonRepository,
    @Inject(AddonPurchaseRepository) private readonly purchases: AddonPurchaseRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  list(tx: Transaction, includeRetired: boolean): Promise<AddonRecord[]> {
    return this.addons.list(tx, includeRetired);
  }

  findById(tx: Transaction, id: string): Promise<AddonRecord | null> {
    return this.addons.findById(tx, id);
  }

  async insert(tx: Transaction, values: NewAddonValues): Promise<AddonRecord> {
    try {
      return await this.addons.insert(tx, values);
    } catch (error) {
      if (this.transactions.isUniqueViolation(error, ADDON_KEY_INDEX)) {
        throw new UniqueViolation('key');
      }
      throw error;
    }
  }

  update(tx: Transaction, id: string, edit: AddonEdit): Promise<AddonRecord | null> {
    return this.addons.update(tx, id, edit);
  }

  retire(tx: Transaction, id: string, at: Date): Promise<AddonRecord | null> {
    return this.addons.retire(tx, id, at);
  }

  insertPurchase(tx: Transaction, values: NewAddonPurchaseValues): Promise<AddonPurchaseRecord> {
    return this.purchases.insert(tx, values);
  }

  findPurchaseByPaymentForUpdate(
    tx: Transaction,
    planPaymentId: string,
  ): Promise<AddonPurchaseRecord | null> {
    return this.purchases.findByPaymentForUpdate(tx, planPaymentId);
  }

  activatePurchase(tx: Transaction, id: string, startsAt: Date): Promise<void> {
    return this.purchases.activate(tx, id, startsAt);
  }

  activeUnits(tx: Transaction, tenantId: string): Promise<AddonUnits[]> {
    return this.purchases.activeUnits(tx, tenantId);
  }

  listActive(tx: Transaction, tenantId: string): Promise<ActiveAddon[]> {
    return this.purchases.listActive(tx, tenantId);
  }
}
