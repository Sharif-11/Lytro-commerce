import { Inject, Injectable } from '@nestjs/common';
import { OperatorAccountRepository, TransactionRunner, type Transaction } from '@lytronix/db';
import type { OperatorInboxes } from '../../modules/shared/mail/services/operator-alerts';
import { DatabaseService } from '../database.service';

/** D7-43: the operators' addresses, as the fast-spend alert reads them, and a transaction for their outbox rows. */
@Injectable()
export class DrizzleOperatorInboxes implements OperatorInboxes {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(OperatorAccountRepository) private readonly operators: OperatorAccountRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  list(): Promise<string[]> {
    return this.operators.enrolledEmails(this.database.handle.db);
  }
}
