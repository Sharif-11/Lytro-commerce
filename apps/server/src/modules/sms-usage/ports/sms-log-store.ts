import type { SmsLogKind, SmsLogStatus } from '@lytronix/validators';

export interface SmsLogEntry {
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

/** tenant.sms_log (SMS-07, SMS-17), written in its own transaction once an SMS's fate is known. */
export interface SmsLogStore {
  record(entry: SmsLogEntry): Promise<void>;
}
