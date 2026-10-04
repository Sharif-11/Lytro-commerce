import type { ClaimedSmsMessage } from '@lytronix/db';
import type { SmsKind } from '@lytronix/validators';

export type MessageKind = SmsKind;

/** A recorded message. For an OTP, the body exists only in memory for the send that follows the request. */
export interface QueuedMessage {
  id: number;
  toPhone: string;
  body: string;
}

/** A message claimed for sending. The shape is defined by the database package's outbox. */
export type ClaimedMessage = ClaimedSmsMessage;
