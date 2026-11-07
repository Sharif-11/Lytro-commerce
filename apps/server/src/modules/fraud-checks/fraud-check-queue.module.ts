import { Module } from '@nestjs/common';
import { QueueModule } from '../shared/queue/queue.module';
import { FraudCheckQueue } from './services/fraud-check-queue';

// FRD-05 (Slice 7.5): the queue alone, so orders can queue a check without reaching the couriers the check asks, which
// themselves read orders.
@Module({
  imports: [QueueModule],
  providers: [FraudCheckQueue],
  exports: [FraudCheckQueue],
})
export class FraudCheckQueueModule {}
