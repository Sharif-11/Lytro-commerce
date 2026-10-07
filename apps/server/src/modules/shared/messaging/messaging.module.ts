import { Module } from '@nestjs/common';
import { DrizzleMessageStore } from '../../../database/adapters/messaging.adapter';
import { QueueModule } from '../queue/queue.module';
import { ConsoleSmsProvider } from './providers/console-sms.provider';
import { MessagingService } from './services/messaging.service';
import { SmsWorker } from './services/sms-worker';
import { MESSAGE_STORE, MESSAGING_CLOCK, SMS_PROVIDER } from './tokens';

// D27: imports QueueModule so MessagingService can queue a bounded OTP retry through the one queue interface.
@Module({
  imports: [QueueModule],
  providers: [
    { provide: MESSAGE_STORE, useClass: DrizzleMessageStore },
    { provide: SMS_PROVIDER, useClass: ConsoleSmsProvider },
    { provide: MESSAGING_CLOCK, useValue: (): Date => new Date() },
    MessagingService,
    SmsWorker,
  ],
  exports: [MessagingService],
})
export class MessagingModule {}
