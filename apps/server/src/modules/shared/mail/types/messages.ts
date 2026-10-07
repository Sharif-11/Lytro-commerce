import type { ClaimedMailMessage as RepositoryClaimedMailMessage } from '@lytronix/db';
import type { MailKind } from '@lytronix/validators';

export type MailMessageKind = MailKind;

/** A recorded message. For an OTP, the body exists only in memory for the send that follows the request. */
export interface QueuedMailMessage {
  id: number;
  toEmail: string;
  subject: string;
  body: string;
}

/** A message claimed for sending. The shape is defined by the database package's outbox. */
export type ClaimedMailMessage = RepositoryClaimedMailMessage;

/**
 * The job payload for an OTP email's bounded retry (D29, mirrors SmsRetryPayload). Carries the plaintext body,
 * since only the code's hash is ever stored elsewhere — the job itself is bounded to what's left of the code's
 * own TTL (`expireInSeconds`), so pg-boss drops it once that window passes or the resend succeeds.
 */
export interface MailRetryPayload {
  messageId: number;
  toEmail: string;
  subject: string;
  body: string;
}
