import type { SmsBlockedReason, SmsLogEntryKind, SmsLogStatus } from '@lytronix/validators';

export interface SmsLogEntry {
  tenantId: string;
  kind: SmsLogEntryKind;
  toPhone: string;
  units: number;
  cost: string;
  isEssential: boolean;
  status: SmsLogStatus;
  blockedReason?: SmsBlockedReason | null;
  providerMessageId?: string | null;
  /** Slice 7.2: an SMS event's order and words; a code has neither. */
  orderId?: string | null;
  body?: string | null;
}

/** tenant.sms_log (SMS-07, SMS-17), written in its own transaction once an SMS's fate is known. */
export interface SmsLogStore {
  record(entry: SmsLogEntry): Promise<void>;
}
