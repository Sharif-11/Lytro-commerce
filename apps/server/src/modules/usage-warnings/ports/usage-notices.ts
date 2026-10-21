import type { Transaction } from '@lytronix/db';
import type { UsageNotice } from '../types/usage-notice';

/** LIM-01: hands a usage notice on to be written and sent, in the caller's own transaction (SCL-08). */
export interface UsageNotices {
  queue(tx: Transaction, notice: UsageNotice): Promise<void>;
}
