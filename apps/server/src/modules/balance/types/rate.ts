import type { RateKey } from '@lytronix/validators';

export interface RateValue {
  key: RateKey;
  value: string;
  effectiveFrom: Date;
}

export interface RateHistoryEntry {
  id: number;
  key: RateKey;
  oldValue: string | null;
  newValue: string;
  changedBy: string | null;
  noticeId: string | null;
  changedAt: Date;
}
