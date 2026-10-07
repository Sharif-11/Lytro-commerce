import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { MessagingModule } from '../messaging/messaging.module';
import { QueueModule } from '../queue/queue.module';
import { MailRetryWorker } from './services/mail-retry-worker';
import { SmsRetryWorker } from './services/sms-retry-worker';

// D27, D29: registers pg-boss queues and their work handlers. Kept apart from QueueModule (the queue mechanism
// itself, SCL-08, D25) and from MessagingModule/MailModule (the delivery business rules), so adding a worker
// never touches either of those.
@Module({
  imports: [QueueModule, MessagingModule, MailModule],
  providers: [SmsRetryWorker, MailRetryWorker],
})
export class QueueWorkersModule {}
