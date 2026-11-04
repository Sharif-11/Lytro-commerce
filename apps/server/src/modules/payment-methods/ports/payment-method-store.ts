import type { NewPaymentAccount, SelectWalletAccount, Transaction } from '@lytronix/db';
import type { PaymentMethod, PaymentWay } from '@lytronix/validators';

/** WAL-01 to WAL-17 (Slice 5.1): tenant.wallet_accounts and tenant.payment_methods_on, and the owner's phone. */
export interface PaymentMethodStore {
  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
  list(tx: Transaction, tenantId: string): Promise<SelectWalletAccount[]>;
  listOn(tx: Transaction, tenantId: string): Promise<PaymentMethod[]>;
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
  setOn(tx: Transaction, tenantId: string, method: PaymentMethod, on: boolean): Promise<void>;
  ownerPhoneVerified(tx: Transaction, tenantId: string): Promise<boolean>;
  /** PAY-06, WAL-09, WAL-10 (Slice 5.7): the owner's ways, sealed credentials and automated account. */
  listWays(
    tx: Transaction,
    tenantId: string,
  ): Promise<{ method: PaymentMethod; way: PaymentWay }[]>;
  setWay(tx: Transaction, tenantId: string, method: PaymentMethod, way: PaymentWay): Promise<void>;
  setGateway(
    tx: Transaction,
    tenantId: string,
    id: string,
    values: { credentials: Buffer; sandbox: boolean } | null,
  ): Promise<SelectWalletAccount | null>;
  selectAutomated(
    tx: Transaction,
    tenantId: string,
    method: PaymentMethod,
    id: string,
  ): Promise<void>;
  findAccount(tx: Transaction, tenantId: string, id: string): Promise<SelectWalletAccount | null>;
  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void>;
}
