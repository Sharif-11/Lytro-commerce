import type {
  NewPlatformBankAccount,
  SelectPlatformBankAccount,
  SelectPlatformGatewayAccount,
  SelectPlatformPaymentMethod,
  Transaction,
} from '@lytronix/db';
import type { PaymentMethod, PaymentWay } from '@lytronix/validators';

/** control.platform_payment_methods, platform_bank_accounts and platform_gateway_accounts. Platform-wide, no tenant. */
export interface LytroPaymentMethodStore {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  choices(): Promise<SelectPlatformPaymentMethod[]>;
  saveChoice(
    tx: Transaction,
    method: PaymentMethod,
    values: { enabled: boolean; way: PaymentWay },
  ): Promise<void>;
  bankAccounts(enabledOnly: boolean): Promise<SelectPlatformBankAccount[]>;
  addBankAccount(
    tx: Transaction,
    values: NewPlatformBankAccount,
  ): Promise<SelectPlatformBankAccount>;
  updateBankAccount(
    tx: Transaction,
    id: string,
    values: Partial<NewPlatformBankAccount>,
  ): Promise<SelectPlatformBankAccount | null>;
  removeBankAccount(tx: Transaction, id: string): Promise<boolean>;
  gatewayAccount(method: PaymentMethod): Promise<SelectPlatformGatewayAccount | null>;
  saveGatewayAccount(
    tx: Transaction,
    values: { method: PaymentMethod; number: string; credentials: Buffer; sandbox: boolean },
  ): Promise<void>;
  removeGatewayAccount(tx: Transaction, method: PaymentMethod): Promise<boolean>;
}
