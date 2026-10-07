import type { ClaimedSmsMessage } from '@lytronix/db';
import type { SmsKind } from '@lytronix/validators';

export type MessageKind = SmsKind;

/**
 * A recorded message. For an OTP, the body exists only in memory for the send that follows the request, or
 * briefly in a bounded pg-boss retry job if that first send fails (D27).
 */
export interface QueuedMessage {
  id: number;
  toPhone: string;
  body: string;
}

/** A message claimed for sending. The shape is defined by the database package's outbox. */
export type ClaimedMessage = ClaimedSmsMessage;

/**
 * The job payload for an OTP's bounded retry (D27). Carries the plaintext body, since only the code's hash is
 * ever stored elsewhere — the job itself is bounded to what's left of the code's own TTL (`expireInSeconds`),
 * so pg-boss drops it once that window passes or the resend succeeds.
 */
export interface SmsRetryPayload {
  messageId: number;
  toPhone: string;
  body: string;
}
