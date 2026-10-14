import { Module } from '@nestjs/common';
import { BillingModule } from '../../billing/billing.module';
import { MessagingModule } from '../messaging/messaging.module';
import { QueueModule } from '../queue/queue.module';
import { LifecycleTickWorker } from './services/lifecycle-tick-worker';
import { SmsRetryWorker } from './services/sms-retry-worker';

// D27/D2-6: registers pg-boss queues and their work handlers. Kept apart from QueueModule (the queue mechanism
// itself, SCL-08, D25) and from MessagingModule/BillingModule (the delivery/lifecycle business rules), so
// adding a worker never touches either of those.
@Module({
  imports: [QueueModule, MessagingModule, BillingModule],
  providers: [SmsRetryWorker, LifecycleTickWorker],
})
export class QueueWorkersModule {}
