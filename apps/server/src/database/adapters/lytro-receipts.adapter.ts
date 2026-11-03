import { Inject, Injectable } from '@nestjs/common';
import {
  LytroMessageRepository,
  TransactionRunner,
  type NewLytroMessage,
  type SelectLytroListenerMessage,
  type Transaction,
} from '@lytronix/db';
import type { ListenerMessageStatus, PaymentReviewReason } from '@lytronix/validators';
import type { LytroReceiptStore } from '../../modules/lytro-receipts/ports/lytro-receipt-store';
import { DatabaseService } from '../database.service';

@Injectable()
export class DrizzleLytroReceiptStore implements LytroReceiptStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(LytroMessageRepository) private readonly messages: LytroMessageRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  holdTransactionId(tx: Transaction, transactionId: string): Promise<void> {
    return this.messages.holdTransactionId(tx, transactionId);
  }

  holderOf(tx: Transaction, transactionId: string): Promise<SelectLytroListenerMessage | null> {
    return this.messages.holderOf(tx, transactionId);
  }

  ofPhone(
    tx: Transaction,
    deviceId: string,
    transactionId: string,
  ): Promise<SelectLytroListenerMessage | null> {
    return this.messages.ofPhone(tx, deviceId, transactionId);
  }

  insert(tx: Transaction, values: NewLytroMessage): Promise<SelectLytroListenerMessage> {
    return this.messages.insert(tx, values);
  }

  insertAlone(values: NewLytroMessage): Promise<SelectLytroListenerMessage> {
    return this.messages.insert(this.database.handle.db, values);
  }

  settle(
    tx: Transaction,
    id: string,
    outcome: {
      status: ListenerMessageStatus;
      reviewReason: PaymentReviewReason | null;
      planPaymentId: string | null;
    },
  ): Promise<SelectLytroListenerMessage> {
    return this.messages.settle(tx, id, outcome);
  }

  recent(deviceId: string, limit: number): Promise<SelectLytroListenerMessage[]> {
    return this.messages.recent(this.database.handle.db, deviceId, limit);
  }

  counts(
    deviceId: string,
    since: Date,
  ): Promise<{ verified: number; waiting: number; toCheck: number }> {
    return this.messages.counts(this.database.handle.db, deviceId, since);
  }

  list(
    filter: { status?: ListenerMessageStatus; search: string | null },
    page: { offset: number; limit: number },
  ): Promise<{ rows: SelectLytroListenerMessage[]; total: number }> {
    return this.messages.list(this.database.handle.db, filter, page);
  }

  redact(before: Date): Promise<{ redacted: number; removed: number }> {
    return this.messages.redact(this.database.handle.db, before);
  }
}
