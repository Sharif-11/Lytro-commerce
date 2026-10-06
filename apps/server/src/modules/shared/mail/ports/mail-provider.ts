export interface MailMessage {
  to: string;
  subject: string;
  body: string;
}

/** Sends an email. Implementations throw when the message is not accepted by the provider. */
export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}
