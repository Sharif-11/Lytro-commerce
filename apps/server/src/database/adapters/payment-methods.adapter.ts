import { Inject, Injectable } from '@nestjs/common';
import {
  PaymentMethodRepository,
  TransactionRunner,
  type NewPaymentAccount,
  type SelectWalletAccount,
  type Transaction,
} from '@lytronix/db';
import type { PaymentMethod } from '@lytronix/validators';
import type { PaymentMethodStore } from '../../modules/payment-methods/ports/payment-method-store';
import { DatabaseService } from '../database.service';

@Injectable()
export class DrizzlePaymentMethodStore implements PaymentMethodStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PaymentMethodRepository) private readonly methods: PaymentMethodRepository,
  ) {}

  run<T>(_tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  list(tx: Transaction, tenantId: string): Promise<SelectWalletAccount[]> {
    return this.methods.list(tx, tenantId);
  }

  listOff(tx: Transaction, tenantId: string): Promise<PaymentMethod[]> {
    return this.methods.listOff(tx, tenantId);
  }

  lockMethod(
    tx: Transaction,
    tenantId: string,
    method: PaymentMethod,
  ): Promise<SelectWalletAccount[]> {
    return this.methods.lockMethod(tx, tenantId, method);
  }

  replaceMethod(
    tx: Transaction,
    tenantId: string,
    method: PaymentMethod,
    accounts: readonly NewPaymentAccount[],
  ): Promise<void> {
    return this.methods.replaceMethod(tx, tenantId, method, accounts);
  }

  setOff(tx: Transaction, tenantId: string, method: PaymentMethod, off: boolean): Promise<void> {
    return this.methods.setOff(tx, tenantId, method, off);
  }

  ownerPhoneVerified(tx: Transaction, tenantId: string): Promise<boolean> {
    return this.methods.ownerPhoneVerified(tx, tenantId);
  }

  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    return this.methods.deleteAllForTenant(tx, tenantId);
  }
}
