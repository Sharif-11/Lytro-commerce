import { Module } from '@nestjs/common';
import { DrizzleMessageStore } from '../database/adapters/messaging.adapter';
import { ConsoleSmsProvider } from './providers/console-sms.provider';
import { MessagingService } from './services/messaging.service';
import { MESSAGE_STORE, SMS_PROVIDER } from './tokens';

@Module({
  providers: [
    { provide: MESSAGE_STORE, useFactory: () => new DrizzleMessageStore() },
    { provide: SMS_PROVIDER, useClass: ConsoleSmsProvider },
    MessagingService,
  ],
  exports: [MessagingService],
})
export class MessagingModule {}
