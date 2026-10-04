import { insertSmsMessage, type Executor } from '@lytronix/db';
import type { MessageStore, OutboundMessage } from '../../messaging/services/messaging.service';

/** Database-backed outbox. */
export class DrizzleMessageStore implements MessageStore {
  insert(executor: Executor, message: OutboundMessage): Promise<void> {
    return insertSmsMessage(executor, message);
  }
}
