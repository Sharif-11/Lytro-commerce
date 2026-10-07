import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { QueueModule } from '../queue/queue.module';
import { SmsRetryWorker } from './services/sms-retry-worker';

// D27: registers pg-boss queues and their work handlers. Kept apart from QueueModule (the queue mechanism
// itself, SCL-08, D25) and from MessagingModule (the delivery business rules), so adding a worker never touches
// either of those.
@Module({
  imports: [QueueModule, MessagingModule],
  providers: [SmsRetryWorker],
})
export class QueueWorkersModule {}
