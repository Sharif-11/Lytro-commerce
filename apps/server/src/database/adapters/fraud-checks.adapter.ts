import { Inject, Injectable } from '@nestjs/common';
import {
  FraudCheckRepository,
  TransactionRunner,
  type NewFraudCheck,
  type OwnOrderCounts,
  type SelectFraudCheck,
  type SelectFraudRule,
  type Transaction,
} from '@lytronix/db';
import type { FraudCheckStore } from '../../modules/fraud-checks/ports/fraud-check-store';
import { DatabaseService } from '../database.service';

/** tenant.fraud_checks and tenant.fraud_rules, and the shop's own orders with a phone (Slice 7.5). */
@Injectable()
export class DrizzleFraudCheckStore implements FraudCheckStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(FraudCheckRepository) private readonly checks: FraudCheckRepository,
  ) {}

  run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, async (tx) => {
      await this.transactions.setTenantContext(tx, tenantId);
      return work(tx);
    });
  }

  steadfastAnswerSince(
    tx: Transaction,
    tenantId: string,
    phone: string,
    since: Date,
  ): Promise<SelectFraudCheck | null> {
    return this.checks.steadfastAnswerSince(tx, tenantId, phone, since);
  }

  latest(tx: Transaction, tenantId: string, phone: string): Promise<SelectFraudCheck | null> {
    return this.checks.latest(tx, tenantId, phone);
  }

  ownOrders(tx: Transaction, tenantId: string, phone: string): Promise<OwnOrderCounts> {
    return this.checks.ownOrders(tx, tenantId, phone);
  }

  insert(tx: Transaction, values: NewFraudCheck): Promise<SelectFraudCheck> {
    return this.checks.insert(tx, values);
  }

  rule(tx: Transaction, tenantId: string): Promise<SelectFraudRule | null> {
    return this.checks.rule(tx, tenantId);
  }

  saveRule(
    tx: Transaction,
    tenantId: string,
    rule: { codOrders: boolean; minAmount: string | null },
  ): Promise<SelectFraudRule> {
    return this.checks.saveRule(tx, tenantId, rule);
  }
}
