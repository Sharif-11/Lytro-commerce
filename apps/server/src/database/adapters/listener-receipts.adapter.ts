import { Inject, Injectable } from '@nestjs/common';
import {
  ListenerMessageRepository,
  ListenerRepository,
  TenantRepository,
  TransactionRunner,
  type ListenerMessageCounts,
  type ListenerMessageFilter,
  type ListenerMessageOutcome,
  type ListenerMessageRow,
  type NewListenerMessage,
  type SelectListenerMessage,
  type SelectListenerUnreadShape,
  type Transaction,
} from '@lytronix/db';
import type { ReceiptStore } from '../../modules/listener-receipts/ports/receipt-store';
import { DatabaseService } from '../database.service';

@Injectable()
export class DrizzleReceiptStore implements ReceiptStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(TransactionRunner) private readonly transactions: TransactionRunner,
    @Inject(ListenerMessageRepository) private readonly messages: ListenerMessageRepository,
    @Inject(ListenerRepository) private readonly listener: ListenerRepository,
    @Inject(TenantRepository) private readonly tenants: TenantRepository,
  ) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.transactions.run(this.database.handle.db, work);
  }

  listShopIds(): Promise<string[]> {
    return this.tenants.listLiveIds(this.database.handle.db);
  }

  holdTransactionId(tx: Transaction, tenantId: string, transactionId: string): Promise<void> {
    return this.messages.holdTransactionId(tx, tenantId, transactionId);
  }

  holderOf(
    tx: Transaction,
    tenantId: string,
    transactionId: string,
  ): Promise<SelectListenerMessage | null> {
    return this.messages.holderOf(tx, tenantId, transactionId);
  }

  ofPhone(
    tx: Transaction,
    tenantId: string,
    deviceId: string,
    transactionId: string,
  ): Promise<SelectListenerMessage | null> {
    return this.messages.ofPhone(tx, tenantId, deviceId, transactionId);
  }

  insert(
    tx: Transaction,
    tenantId: string,
    values: NewListenerMessage,
  ): Promise<SelectListenerMessage> {
    return this.messages.insert(tx, tenantId, values);
  }

  settle(
    tx: Transaction,
    tenantId: string,
    id: string,
    outcome: ListenerMessageOutcome,
  ): Promise<SelectListenerMessage> {
    return this.messages.settle(tx, tenantId, id, outcome);
  }

  paymentCarrying(
    tx: Transaction,
    tenantId: string,
    transactionId: string,
  ): Promise<{ id: string; sessionId: string | null } | null> {
    return this.messages.paymentCarrying(tx, tenantId, transactionId);
  }

  recent(
    tx: Transaction,
    tenantId: string,
    deviceId: string,
    limit: number,
  ): Promise<ListenerMessageRow[]> {
    return this.messages.recent(tx, tenantId, deviceId, limit);
  }

  counts(
    tx: Transaction,
    tenantId: string,
    deviceId: string,
    since: Date,
  ): Promise<ListenerMessageCounts> {
    return this.messages.counts(tx, tenantId, deviceId, since);
  }

  list(
    tx: Transaction,
    tenantId: string,
    filter: ListenerMessageFilter,
    page: { offset: number; limit: number },
  ): Promise<{ rows: ListenerMessageRow[]; total: number }> {
    return this.messages.list(tx, tenantId, filter, page);
  }

  redact(
    tx: Transaction,
    tenantId: string,
    before: Date,
  ): Promise<{ redacted: number; removed: number }> {
    return this.messages.redact(tx, tenantId, before);
  }

  noteUploads(
    tx: Transaction,
    deviceId: string,
    values: { at: Date; appVersion: string; day: string; count: number },
  ): Promise<void> {
    return this.listener.noteUploads(tx, deviceId, values);
  }

  flagVolume(tx: Transaction, deviceId: string, at: Date, since: Date): Promise<boolean> {
    return this.listener.flagVolume(tx, deviceId, at, since);
  }

  addUnread(
    tx: Transaction,
    values: { day: string; shapeHash: string; shape: string },
  ): Promise<number> {
    return this.listener.addUnread(tx, values);
  }

  listUnread(day: string): Promise<SelectListenerUnreadShape[]> {
    return this.listener.listUnread(this.database.handle.db, day);
  }

  purgeUnread(tx: Transaction, day: string): Promise<number> {
    return this.listener.purgeUnread(tx, day);
  }
}
