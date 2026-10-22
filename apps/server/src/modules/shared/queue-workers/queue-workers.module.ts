import { Module } from '@nestjs/common';
import { BillingModule } from '../../billing/billing.module';
import { DataExportModule } from '../../data-export/data-export.module';
import { InventoryModule } from '../../inventory/inventory.module';
import { MediaModule } from '../../media/media.module';
import { PaymentsModule } from '../../payments/payments.module';
import { MessagingModule } from '../messaging/messaging.module';
import { QueueModule } from '../queue/queue.module';
import { LifecycleTickWorker } from './services/lifecycle-tick-worker';
import { SmsRetryWorker } from './services/sms-retry-worker';
import { DataExportWorker } from './services/data-export-worker';
import { InventoryExpiryTickWorker } from './services/inventory-expiry-tick-worker';
import { ReservationExpiryTickWorker } from './services/reservation-expiry-tick-worker';
import { MediaDeleteWorker } from './services/media-delete-worker';
import { MediaProcessVideoWorker } from './services/media-process-video-worker';
import { MediaProcessWorker } from './services/media-process-worker';
import { MediaBandwidthTickWorker } from './services/media-bandwidth-tick-worker';
import { MediaReconcileTickWorker } from './services/media-reconcile-tick-worker';
import { UsageModule } from '../../usage/usage.module';
import { PackAutoBuyWorker } from './services/pack-auto-buy-worker';
import { UsageNoticeWorker } from './services/usage-notice-worker';

// D27/D2-6: registers pg-boss queues and their work handlers. Kept apart from QueueModule (the queue mechanism
// itself, SCL-08, D25) and from MessagingModule/BillingModule (the delivery/lifecycle business rules), so
// adding a worker never touches either of those. PaymentsModule is imported directly (BIL-15's own sweep)
// since BillingModule doesn't re-export it, even though it imports it for its own internal use.
@Module({
  imports: [
    QueueModule,
    MessagingModule,
    BillingModule,
    DataExportModule,
    PaymentsModule,
    InventoryModule,
    MediaModule,
    UsageModule,
  ],
  providers: [
    SmsRetryWorker,
    LifecycleTickWorker,
    DataExportWorker,
    InventoryExpiryTickWorker,
    ReservationExpiryTickWorker,
    MediaProcessWorker,
    MediaProcessVideoWorker,
    MediaDeleteWorker,
    MediaReconcileTickWorker,
    MediaBandwidthTickWorker,
    UsageNoticeWorker,
    PackAutoBuyWorker,
  ],
})
export class QueueWorkersModule {}
