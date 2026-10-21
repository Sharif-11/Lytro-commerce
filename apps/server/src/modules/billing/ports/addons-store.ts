import type { Transaction } from '@lytronix/db';
import type {
  ActiveAddon,
  AddonEdit,
  AddonPurchaseRecord,
  AddonRecord,
  AddonUnits,
  NewAddonPurchaseValues,
  NewAddonValues,
} from '../types/addon';

/** control.addons and control.addon_purchases (PLN-13, PLN-14). Writes take the caller's transaction. */
export interface AddonsStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  list(tx: Transaction, includeRetired: boolean): Promise<AddonRecord[]>;
  findById(tx: Transaction, id: string): Promise<AddonRecord | null>;
  insert(tx: Transaction, values: NewAddonValues): Promise<AddonRecord>;
  update(tx: Transaction, id: string, edit: AddonEdit): Promise<AddonRecord | null>;
  retire(tx: Transaction, id: string, at: Date): Promise<AddonRecord | null>;
  insertPurchase(tx: Transaction, values: NewAddonPurchaseValues): Promise<AddonPurchaseRecord>;
  findPurchaseByPaymentForUpdate(
    tx: Transaction,
    planPaymentId: string,
  ): Promise<AddonPurchaseRecord | null>;
  activatePurchase(tx: Transaction, id: string, startsAt: Date): Promise<void>;
  activeUnits(tx: Transaction, tenantId: string): Promise<AddonUnits[]>;
  listActive(tx: Transaction, tenantId: string): Promise<ActiveAddon[]>;
}
