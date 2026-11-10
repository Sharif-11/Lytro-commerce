import { Inject, Injectable } from '@nestjs/common';
import {
  LytroPaymentMethodsRepository,
  TransactionRunner,
  type NewPlatformBankAccount,
  type SelectPlatformBankAccount,
  type SelectPlatformGatewayAccount,
  type SelectPlatformPaymentMethod,
  type Transaction,
} from '@lytronix/db';
import type { PaymentMethod, PaymentWay } from '@lytronix/validators';
import type { LytroPaymentMethodStore } from '../../modules/lytro-payments/ports/lytro-payment-method-store';
import { DatabaseService } from '../database.service';

/** Database-backed payment methods for shops paying Lytro. Platform-wide, no tenant context. */
@Injectable()
export class DrizzleLytroPaymentMethodStore implements LytroPaymentMethodStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(LytroPaymentMethodsRepository) private readonly methods: LytroPaymentMethodsRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  choices(): Promise<SelectPlatformPaymentMethod[]> {
    return this.methods.listChoices(this.database.handle.db);
  }

  saveChoice(
    tx: Transaction,
    method: PaymentMethod,
    values: { enabled: boolean; way: PaymentWay },
  ): Promise<void> {
    return this.methods.saveChoice(tx, method, values);
  }

  bankAccounts(enabledOnly: boolean): Promise<SelectPlatformBankAccount[]> {
    return this.methods.listBankAccounts(this.database.handle.db, enabledOnly);
  }

  addBankAccount(
    tx: Transaction,
    values: NewPlatformBankAccount,
  ): Promise<SelectPlatformBankAccount> {
    return this.methods.insertBankAccount(tx, values);
  }

  updateBankAccount(
    tx: Transaction,
    id: string,
    values: Partial<NewPlatformBankAccount>,
  ): Promise<SelectPlatformBankAccount | null> {
    return this.methods.updateBankAccount(tx, id, values);
  }

  bankAccountUsed(tx: Transaction, id: string): Promise<boolean> {
    return this.methods.bankAccountUsed(tx, id);
  }

  removeBankAccount(tx: Transaction, id: string): Promise<boolean> {
    return this.methods.removeBankAccount(tx, id);
  }

  gatewayAccount(method: PaymentMethod): Promise<SelectPlatformGatewayAccount | null> {
    return this.methods.gatewayAccount(this.database.handle.db, method);
  }

  saveGatewayAccount(
    tx: Transaction,
    values: { method: PaymentMethod; number: string; credentials: Buffer; sandbox: boolean },
  ): Promise<void> {
    return this.methods.saveGatewayAccount(tx, values);
  }

  removeGatewayAccount(tx: Transaction, method: PaymentMethod): Promise<boolean> {
    return this.methods.removeGatewayAccount(tx, method);
  }
}
