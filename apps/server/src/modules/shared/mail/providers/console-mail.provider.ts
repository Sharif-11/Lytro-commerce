import { Injectable } from '@nestjs/common';
import type { MailMessage, MailProvider } from '../ports/mail-provider';

// The stub provider: prints each email so a developer can read it, and stays silent in tests.
@Injectable()
export class ConsoleMailProvider implements MailProvider {
  send(message: MailMessage): Promise<void> {
    if (process.env['NODE_ENV'] !== 'test') {
      console.info(`[mail-stub] to ${message.to}: ${message.subject}: ${message.body}`);
    }
    return Promise.resolve();
  }
}
