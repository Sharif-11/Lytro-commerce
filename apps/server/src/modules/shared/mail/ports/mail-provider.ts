export interface MailMessage {
  to: string;
  subject: string;
  body: string;
  /** D7-3 (Slice 7.3): the outbox's own key for this email, so a provider never sends it twice. */
  idempotencyKey?: string;
}

/** What a provider says of an email it accepted (D7-3): its own ID for it, when it gives one. */
export interface MailSent {
  providerMessageId: string | null;
}

/** Sends an email. Implementations throw when the message is not accepted by the provider. */
export interface MailProvider {
  send(message: MailMessage): Promise<MailSent>;
}
