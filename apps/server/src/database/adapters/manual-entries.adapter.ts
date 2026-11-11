import { Inject, Injectable } from '@nestjs/common';
import {
  LytroPaymentMethodsRepository,
  ManualEntryRepository,
  PaymentEvidenceRepository,
  PlatformWalletsRepository,
  type InsertManualPaymentEntry,
  type ManualEntryFilters,
  type ManualEntryRow,
  type SelectManualPaymentEntry,
  type Transaction,
} from '@lytronix/db';
import type { ManualEntriesStore } from '../../modules/manual-entries/ports/manual-entries-store';
import type {
  NewPaymentEvidence,
  PaymentEvidenceRecord,
  PaymentEvidenceStore,
} from '../../modules/payment-evidence/ports/payment-evidence-store';
import { DatabaseService } from '../database.service';

/** ADM-14, ADM-15: the operator's manual entries. */
@Injectable()
export class DrizzleManualEntriesStore implements ManualEntriesStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(ManualEntryRepository) private readonly entries: ManualEntryRepository,
    @Inject(PlatformWalletsRepository) private readonly wallets: PlatformWalletsRepository,
    @Inject(LytroPaymentMethodsRepository) private readonly methods: LytroPaymentMethodsRepository,
  ) {}

  insert(tx: Transaction, values: InsertManualPaymentEntry): Promise<SelectManualPaymentEntry> {
    return this.entries.insert(tx, values);
  }

  findById(tx: Transaction, id: string): Promise<SelectManualPaymentEntry | null> {
    return this.entries.findById(tx, id);
  }

  countEntriesSince(tx: Transaction, since: Date): Promise<number> {
    return this.entries.countEntriesSince(tx, since);
  }

  hasReversedUse(tx: Transaction, transactionId: string): Promise<boolean> {
    return this.entries.hasReversedUse(tx, transactionId);
  }

  walletExists(id: string): Promise<boolean> {
    return this.wallets.exists(this.database.handle.db, id);
  }

  bankAccountExists(id: string): Promise<boolean> {
    return this.methods.bankAccountExists(this.database.handle.db, id);
  }

  list(filters: ManualEntryFilters): Promise<{ entries: ManualEntryRow[]; total: number }> {
    return this.entries.list(this.database.handle.db, filters);
  }

  async view(tx: Transaction, id: string): Promise<ManualEntryRow | null> {
    const { entries } = await this.entries.list(tx, { id, page: 1, limit: 1 });
    return entries[0] ?? null;
  }
}

/** ADM-14, ADM-17, D8-47: the record of each payment screenshot. */
@Injectable()
export class DrizzlePaymentEvidenceStore implements PaymentEvidenceStore {
  constructor(
    @Inject(DatabaseService) private readonly database: Pick<DatabaseService, 'handle'>,
    @Inject(PaymentEvidenceRepository) private readonly evidence: PaymentEvidenceRepository,
  ) {}

  insert(values: NewPaymentEvidence): Promise<PaymentEvidenceRecord> {
    return this.evidence.insert(this.database.handle.db, values);
  }

  findById(id: string): Promise<PaymentEvidenceRecord | null> {
    return this.evidence.findById(this.database.handle.db, id);
  }

  dueForRemoval(before: Date, limit: number): Promise<PaymentEvidenceRecord[]> {
    return this.evidence.dueForRemoval(this.database.handle.db, before, limit);
  }

  markRemoved(ids: readonly string[], at: Date): Promise<void> {
    return this.evidence.markRemoved(this.database.handle.db, ids, at);
  }
}
