import { Inject, Injectable } from '@nestjs/common';
import { OperatorAccountRepository, TransactionRunner, type Transaction } from '@lytronix/db';
import type { UsageNoticeStore } from '../../modules/usage/ports/usage-notice-store';
import { DatabaseService } from '../database.service';

/** LIM-01, RTE-12: a transaction for a usage notice's outboxes, and the operators' addresses. */
@Injectable()
export class DrizzleUsageNoticeStore implements UsageNoticeStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(OperatorAccountRepository) private readonly operators: OperatorAccountRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  operatorEmails(): Promise<string[]> {
    return this.operators.enrolledEmails(this.database.handle.db);
  }
}
