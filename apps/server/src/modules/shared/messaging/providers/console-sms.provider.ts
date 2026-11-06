import { Injectable } from '@nestjs/common';
import type { SmsProvider, SmsSent } from '../ports/sms-provider';

// D6, D7-21: the stand-in. In development it prints every message so a developer can read the code, at no cost; in
// tests it stays silent.
@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  send(message: { toPhone: string; body: string }): Promise<SmsSent> {
    if (process.env['NODE_ENV'] !== 'test') {
      console.info(`[sms-stub] to ${message.toPhone}: ${message.body}`);
    }
    return Promise.resolve({ providerMessageId: null });
  }
}
