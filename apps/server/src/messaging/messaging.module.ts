import { Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { DrizzleMessageStore } from '../database/adapters/messaging.adapter';
import { ConsoleSmsProvider } from './providers/console-sms.provider';
import { MessagingService } from './services/messaging.service';
import { SmsWorker } from './services/sms-worker';
import { MESSAGE_STORE, MESSAGING_CLOCK, SMS_PROVIDER } from './tokens';

@Module({
  providers: [
    {
      provide: MESSAGE_STORE,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) => new DrizzleMessageStore(database.handle.db),
    },
    { provide: SMS_PROVIDER, useClass: ConsoleSmsProvider },
    { provide: MESSAGING_CLOCK, useValue: (): Date => new Date() },
    MessagingService,
    SmsWorker,
  ],
  exports: [MessagingService],
})
export class MessagingModule {}
