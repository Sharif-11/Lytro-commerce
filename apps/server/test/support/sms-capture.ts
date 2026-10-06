import { randomUUID } from 'node:crypto';

export interface SentText {
  toPhone: string;
  body: string;
}

/** The SMS provider used in tests: keeps every text sent, and can be switched to fail like a provider outage. */
export class SmsCapture {
  readonly sent: SentText[] = [];
  down = false;

  readonly provider = {
    send: (message: SentText): Promise<void> => {
      if (this.down) return Promise.reject(new Error('provider down'));
      this.sent.push(message);
      return Promise.resolve();
    },
  };

  /** The six-digit code most recently texted to a number, as its owner reads it. */
  codeFor(phone: string): string {
    const last = [...this.sent].reverse().find((m) => m.toPhone === phone);
    return /(\d{6})/.exec(last?.body ?? '')?.[1] ?? '';
  }

  countFor(phone: string): number {
    return this.sent.filter((m) => m.toPhone === phone).length;
  }

  /** A fresh Bangladeshi number, so runs never collide. */
  freshPhone(): string {
    return `0171${randomUUID().replace(/\D/g, '').slice(0, 7)}`;
  }
}
