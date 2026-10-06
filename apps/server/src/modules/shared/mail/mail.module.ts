import { Module } from '@nestjs/common';
import { ConsoleMailProvider } from './providers/console-mail.provider';
import { MailService } from './services/mail.service';
import { MAIL_PROVIDER } from './tokens';

@Module({
  providers: [{ provide: MAIL_PROVIDER, useClass: ConsoleMailProvider }, MailService],
  exports: [MailService],
})
export class MailModule {}
