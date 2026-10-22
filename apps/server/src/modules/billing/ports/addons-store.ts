import type { PackPurchaseRow, Transaction } from '@lytronix/db';
import type { AddonPurchaseStatus } from '@lytronix/validators';
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
  activatePurchase(tx: Transaction, id: string, activation: AddonActivation): Promise<void>;
  cancelPurchase(tx: Transaction, id: string): Promise<void>;
  listForPayments(tx: Transaction, planPaymentIds: string[]): Promise<PaymentAddon[]>;
  listRenewing(tx: Transaction, tenantId: string, periodEnd: Date): Promise<RenewingAddon[]>;
  findPurchaseForTenantForUpdate(
    tx: Transaction,
    tenantId: string,
    id: string,
  ): Promise<AddonPurchaseRecord | null>;
  setRenews(tx: Transaction, id: string, renews: boolean): Promise<void>;
  listEnded(tx: Transaction, continuedBy: AddonPurchaseStatus[]): Promise<RenewingAddon[]>;
  listEndingBy(tx: Transaction, horizon: Date): Promise<RenewingAddon[]>;
  lapse(tx: Transaction, id: string): Promise<void>;
  cancelForPayment(tx: Transaction, planPaymentId: string): Promise<void>;
  cancelForStalePayments(tx: Transaction): Promise<number>;
  listPackPurchases(tx: Transaction, tenantId: string, since: Date): Promise<PackPurchaseRow[]>;
  activeUnits(tx: Transaction, tenantId: string): Promise<AddonUnits[]>;
  listActive(tx: Transaction, tenantId: string): Promise<ActiveAddon[]>;
}
