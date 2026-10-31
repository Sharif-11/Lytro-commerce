import { Module } from '@nestjs/common';
import { DrizzlePaymentListStore } from '../../database/adapters/payment-list.adapter';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentSessionsModule } from '../payment-sessions/payment-sessions.module';
import { PublicApiModule } from '../public-api/public-api.module';
import { QueueModule } from '../shared/queue/queue.module';
import { StaffModule } from '../staff/staff.module';
import { PaymentReview } from './services/payment-review';
import { PaymentsList } from './services/payments-list';
import { PAYMENT_LIST_STORE } from './tokens';

// VER-01, PAY-14, PAY-15, PAY-19 (Phase 5 Slice 5.3): staff verifying and rejecting the transaction IDs shoppers type,
// and the shop's one list of payments. It sits apart from the sessions because a verified checkout tells Meta of the
// purchase (the public API's ad tracking), which itself opens sessions; the team's routes read it.
@Module({
  imports: [
    PaymentSessionsModule,
    OrdersModule,
    CatalogueModule,
    PublicApiModule,
    QueueModule,
    StaffModule,
  ],
  providers: [
    { provide: PAYMENT_LIST_STORE, useClass: DrizzlePaymentListStore },
    PaymentReview,
    PaymentsList,
  ],
  exports: [PaymentReview, PaymentsList],
})
export class PaymentReviewModule {}
