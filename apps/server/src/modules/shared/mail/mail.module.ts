import { Module } from '@nestjs/common';
import { DrizzleMailStore } from '../../../database/adapters/mail.adapter';
import { QueueModule } from '../queue/queue.module';
import { ConsoleMailProvider } from './providers/console-mail.provider';
import { MailService } from './services/mail.service';
import { MailWorker } from './services/mail-worker';
import { MAIL_CLOCK, MAIL_PROVIDER, MAIL_STORE } from './tokens';

// D29: imports QueueModule so MailService can queue a bounded OTP retry through the one queue interface.
@Module({
  imports: [QueueModule],
  providers: [
    { provide: MAIL_PROVIDER, useClass: ConsoleMailProvider },
    { provide: MAIL_STORE, useClass: DrizzleMailStore },
    { provide: MAIL_CLOCK, useValue: (): Date => new Date() },
    MailService,
    MailWorker,
  ],
  exports: [MailService],
})
export class MailModule {}
