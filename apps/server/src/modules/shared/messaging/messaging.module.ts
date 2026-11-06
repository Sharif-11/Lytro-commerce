import { Module } from '@nestjs/common';
import type { Env } from '../../../config/env';
import { ENV } from '../../../config/tokens';
import { DrizzleMessageStore } from '../../../database/adapters/messaging.adapter';
import { QueueModule } from '../queue/queue.module';
import type { SmsFetch } from './providers/bulksmsbd.provider';
import { smsProviderFor } from './providers/sms-provider-choice';
import { MessagingService } from './services/messaging.service';
import { SmsWorker } from './services/sms-worker';
import { MESSAGE_STORE, MESSAGING_CLOCK, SMS_FETCH, SMS_PROVIDER } from './tokens';

// D27: imports QueueModule so MessagingService can queue a bounded OTP retry through the one queue interface.
// D7-21: the provider follows the server's mode -- recorded in tests, logged in development unless forced, sent in
// production.
@Module({
  imports: [QueueModule],
  providers: [
    { provide: MESSAGE_STORE, useClass: DrizzleMessageStore },
    {
      provide: SMS_FETCH,
      useValue: ((input, init) => fetch(input, init)) satisfies SmsFetch,
    },
    {
      provide: SMS_PROVIDER,
      inject: [ENV, SMS_FETCH],
      useFactory: (env: Env, fetchSms: SmsFetch) => smsProviderFor(env, fetchSms),
    },
    { provide: MESSAGING_CLOCK, useValue: (): Date => new Date() },
    MessagingService,
    SmsWorker,
  ],
  exports: [MessagingService],
})
export class MessagingModule {}
