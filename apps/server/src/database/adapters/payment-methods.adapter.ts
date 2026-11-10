import { Inject, Injectable } from '@nestjs/common';
import {
  PaymentMethodRepository,
  PaymentSessionRepository,
  TenantRepository,
  TransactionRunner,
  type NewPaymentAccount,
  type SelectWalletAccount,
  type Transaction,
} from '@lytronix/db';
import type { PaymentMethod, PaymentWay } from '@lytronix/validators';
import type { PaymentMethodStore } from '../../modules/payment-methods/ports/payment-method-store';
import { DatabaseService } from '../database.service';

@Injectable()
export class DrizzlePaymentMethodStore implements PaymentMethodStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(PaymentMethodRepository) private readonly methods: PaymentMethodRepository,
    @Inject(PaymentSessionRepository) private readonly sessions: PaymentSessionRepository,
    @Inject(TenantRepository) private readonly tenants: TenantRepository,
  ) {}

  listShopIds(): Promise<string[]> {
    return this.tenants.listLiveIds(this.database.handle.db);
  }

  openByMethod(
    tx: Transaction,
    tenantId: string,
  ): Promise<{ method: PaymentMethod; open: number }[]> {
    return this.sessions.openByMethod(tx, tenantId);
  }

  deleteMethod(tx: Transaction, tenantId: string, method: PaymentMethod): Promise<number> {
    return this.methods.deleteMethod(tx, tenantId, method);
  }

  checkoutOpenOn(
    tx: Transaction,
    tenantId: string,
    accountIds: readonly string[],
  ): Promise<boolean> {
    return this.sessions.walletTryOpenOn(tx, tenantId, accountIds);
  }

  run<T>(_tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  list(tx: Transaction, tenantId: string): Promise<SelectWalletAccount[]> {
    return this.methods.list(tx, tenantId);
  }

  listOn(tx: Transaction, tenantId: string): Promise<PaymentMethod[]> {
    return this.methods.listOn(tx, tenantId);
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

  setOn(tx: Transaction, tenantId: string, method: PaymentMethod, on: boolean): Promise<void> {
    return this.methods.setOn(tx, tenantId, method, on);
  }

  listWays(
    tx: Transaction,
    tenantId: string,
  ): Promise<{ method: PaymentMethod; way: PaymentWay }[]> {
    return this.methods.listWays(tx, tenantId);
  }

  setWay(tx: Transaction, tenantId: string, method: PaymentMethod, way: PaymentWay): Promise<void> {
    return this.methods.setWay(tx, tenantId, method, way);
  }

  setGateway(
    tx: Transaction,
    tenantId: string,
    id: string,
    values: { credentials: Buffer; sandbox: boolean } | null,
  ): Promise<SelectWalletAccount | null> {
    return this.methods.setGateway(tx, tenantId, id, values);
  }

  selectAutomated(
    tx: Transaction,
    tenantId: string,
    method: PaymentMethod,
    id: string,
  ): Promise<void> {
    return this.methods.selectAutomated(tx, tenantId, method, id);
  }

  findAccount(tx: Transaction, tenantId: string, id: string): Promise<SelectWalletAccount | null> {
    return this.methods.findAccount(tx, tenantId, id);
  }

  ownerPhoneVerified(tx: Transaction, tenantId: string): Promise<boolean> {
    return this.methods.ownerPhoneVerified(tx, tenantId);
  }

  deleteAllForTenant(tx: Transaction, tenantId: string): Promise<void> {
    return this.methods.deleteAllForTenant(tx, tenantId);
  }
}
