import type { Executor } from '../../transactions';
import { smsOutbox } from '../../schema';

// SMS-18, D6: messages are recorded here. A provider (the console stub for now) sends them after commit.
export async function insertSmsMessage(
  db: Executor,
  message: { toPhone: string; kind: 'otp' | 'shop_ready'; body: string },
): Promise<void> {
  await db.insert(smsOutbox).values(message);
}
