import { Module } from '@nestjs/common';
import { QueueModule } from '../shared/queue/queue.module';
import { SmsEventQueue } from './services/sms-event-queue';

// SMS-01 (Slice 7.2): only the queue an order's events go into, a leaf beside the job queue, so orders, payments and
// couriers can queue an SMS event with no import cycle. What sends it is SmsEventsModule.
@Module({
  imports: [QueueModule],
  providers: [SmsEventQueue],
  exports: [SmsEventQueue],
})
export class SmsEventQueueModule {}
