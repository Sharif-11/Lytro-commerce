import { Inject, Injectable } from '@nestjs/common';
import {
  AddonPurchaseRepository,
  AddonRepository,
  TransactionRunner,
  type Transaction,
} from '@lytronix/db';
import type { AddonPurchaseStatus } from '@lytronix/validators';
import { UniqueViolation } from '../../common/errors/unique-violation';
import type { AddonsStore } from '../../modules/billing/ports/addons-store';
import type {
  ActiveAddon,
  AddonActivation,
  AddonEdit,
  AddonPurchaseRecord,
  AddonRecord,
  AddonUnits,
  NewAddonPurchaseValues,
  NewAddonValues,
  PaymentAddon,
  RenewingAddon,
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

  activatePurchase(tx: Transaction, id: string, activation: AddonActivation): Promise<void> {
    return this.purchases.activate(tx, id, activation);
  }

  cancelPurchase(tx: Transaction, id: string): Promise<void> {
    return this.purchases.cancel(tx, id);
  }

  listForPayments(tx: Transaction, planPaymentIds: string[]): Promise<PaymentAddon[]> {
    return this.purchases.listForPayments(tx, planPaymentIds);
  }

  listRenewing(tx: Transaction, tenantId: string, periodEnd: Date): Promise<RenewingAddon[]> {
    return this.purchases.listRenewing(tx, tenantId, periodEnd);
  }

  findPurchaseForTenantForUpdate(
    tx: Transaction,
    tenantId: string,
    id: string,
  ): Promise<AddonPurchaseRecord | null> {
    return this.purchases.findForTenantForUpdate(tx, tenantId, id);
  }

  setRenews(tx: Transaction, id: string, renews: boolean): Promise<void> {
    return this.purchases.setRenews(tx, id, renews);
  }

  listEnded(tx: Transaction, continuedBy: AddonPurchaseStatus[]): Promise<RenewingAddon[]> {
    return this.purchases.listEnded(tx, continuedBy);
  }

  listEndingBy(tx: Transaction, horizon: Date): Promise<RenewingAddon[]> {
    return this.purchases.listEndingBy(tx, horizon);
  }

  lapse(tx: Transaction, id: string): Promise<void> {
    return this.purchases.lapse(tx, id);
  }

  cancelForPayment(tx: Transaction, planPaymentId: string): Promise<void> {
    return this.purchases.cancelForPayment(tx, planPaymentId);
  }

  cancelForStalePayments(tx: Transaction): Promise<number> {
    return this.purchases.cancelForStalePayments(tx);
  }

  activeUnits(tx: Transaction, tenantId: string): Promise<AddonUnits[]> {
    return this.purchases.activeUnits(tx, tenantId);
  }

  listActive(tx: Transaction, tenantId: string): Promise<ActiveAddon[]> {
    return this.purchases.listActive(tx, tenantId);
  }
}
