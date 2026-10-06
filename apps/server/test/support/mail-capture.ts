export interface SentMail {
  to: string;
  subject: string;
  body: string;
}

/** The mail provider used in tests: keeps every email sent, and can be switched to fail like a provider outage. */
export class MailCapture {
  readonly sent: SentMail[] = [];
  down = false;

  readonly provider = {
    send: (message: SentMail): Promise<void> => {
      if (this.down) return Promise.reject(new Error('mail provider down'));
      this.sent.push(message);
      return Promise.resolve();
    },
  };

  /** The six-digit code most recently emailed to an address, as its owner reads it. */
  codeFor(email: string): string {
    const last = [...this.sent].reverse().find((m) => m.to === email);
    return /(\d{6})/.exec(last?.body ?? '')?.[1] ?? '';
  }
}
