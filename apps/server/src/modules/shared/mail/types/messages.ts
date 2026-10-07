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
