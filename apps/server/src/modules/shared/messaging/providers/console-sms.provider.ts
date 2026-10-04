import { Injectable } from '@nestjs/common';
import type { SmsProvider } from '../ports/sms-provider';

// D6: the stub provider. It prints every message so a developer can read the code, and stays silent in tests.
@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  send(message: { toPhone: string; body: string }): Promise<void> {
    if (process.env['NODE_ENV'] !== 'test') {
      console.info(`[sms-stub] to ${message.toPhone}: ${message.body}`);
    }
    return Promise.resolve();
  }
}
