/** What a provider says about an SMS it took. */
export interface SmsSent {
  /** Its own ID for the message, where it gives one (D7-15). */
  providerMessageId: string | null;
}

// The provider that actually sends a text: BulkSMSBD, or the stand-in that logs it (D7-21). A failure is thrown.
export interface SmsProvider {
  send(message: { toPhone: string; body: string }): Promise<SmsSent>;
}
