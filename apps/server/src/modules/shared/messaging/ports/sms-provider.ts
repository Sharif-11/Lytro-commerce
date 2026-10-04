// The provider that actually sends a text. The console stub is one implementation.
export interface SmsProvider {
  send(message: { toPhone: string; body: string }): Promise<void>;
}
