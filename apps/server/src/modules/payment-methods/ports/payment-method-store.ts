import type { NewPaymentAccount, SelectWalletAccount, Transaction } from '@lytronix/db';
import type { PaymentMethod } from '@lytronix/validators';

/** WAL-01 to WAL-17 (Slice 5.1): tenant.wallet_accounts and tenant.payment_methods_off, and the owner's phone. */
export interface PaymentMethodStore {
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  list(tx: Transaction, tenantId: string): Promise<SelectWalletAccount[]>;
  listOff(tx: Transaction, tenantId: string): Promise<PaymentMethod[]>;
  lockMethod(
    tx: Transaction,
    tenantId: string,
    method: PaymentMethod,
  ): Promise<SelectWalletAccount[]>;
  replaceMethod(
    tx: Transaction,
    tenantId: string,
    method: PaymentMethod,
    accounts: readonly NewPaymentAccount[],
  ): Promise<void>;
  setOff(tx: Transaction, tenantId: string, method: PaymentMethod, off: boolean): Promise<void>;
  ownerPhoneVerified(tx: Transaction, tenantId: string): Promise<boolean>;
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
}
