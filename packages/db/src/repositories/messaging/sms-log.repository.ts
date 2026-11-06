import type { SmsLogKind, SmsLogStatus } from '@lytronix/validators';
import { smsLog } from '../../schema';
import type { Transaction, TransactionRunner } from '../../transactions';

export interface NewSmsLogEntry {
  tenantId: string;
  kind: SmsLogKind;
  toPhone: string;
  units: number;
  cost: string;
  isEssential: boolean;
  status: SmsLogStatus;
  blockedReason?: string | null;
  providerMessageId?: string | null;
}

// SMS-07, SMS-17: a shop's own SMS log, written once each SMS's fate is known.
export class SmsLogRepository {
  constructor(private readonly transactions: Pick<TransactionRunner, 'setTenantContext'>) {}

  async insert(db: Transaction, values: NewSmsLogEntry): Promise<void> {
    await this.transactions.setTenantContext(db, values.tenantId);
    await db.insert(smsLog).values({
      ...values,
      blockedReason: values.blockedReason ?? null,
      providerMessageId: values.providerMessageId ?? null,
    });
  }
}
