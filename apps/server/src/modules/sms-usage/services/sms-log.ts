import { Inject, Injectable } from '@nestjs/common';
import type { SmsLogEntry, SmsLogStore } from '../ports/sms-log-store';
import { SMS_LOG_STORE } from '../tokens';

/**
 * SMS-07, SMS-17 (Slice 7.1): one row per SMS a shop's use sent, failed to send, or was refused for. Written once the
 * SMS's fate is known, in its own transaction, and best-effort: the log never changes what the person sees.
 */
@Injectable()
export class SmsLog {
  constructor(@Inject(SMS_LOG_STORE) private readonly store: SmsLogStore) {}

  async record(entry: SmsLogEntry): Promise<void> {
    try {
      await this.store.record(entry);
    } catch (error) {
      console.error(
        `[sms-log] could not record a ${entry.kind} SMS (${entry.status}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
