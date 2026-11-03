import { Module } from '@nestjs/common';
import { ClientIp } from '../../common/client-ip';
import { DrizzleReceiptStore } from '../../database/adapters/listener-receipts.adapter';
import { BalanceModule } from '../balance/balance.module';
import { ListenerModule } from '../listener/listener.module';
import { LytroReceiptsModule } from '../lytro-receipts/lytro-receipts.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentReviewModule } from '../payment-review/payment-review.module';
import { PaymentSessionsModule } from '../payment-sessions/payment-sessions.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { ListenerReceiptsController } from './controllers/listener-receipts.controller';
import { ListenerReceipts } from './services/listener-receipts';
import { PaymentSubmissions } from './services/payment-submissions';
import { ReceiptMatcher } from './services/receipt-matcher';
import { RECEIPT_STORE } from './tokens';

// LSN-04, LSN-13 to LSN-17, VER-02 to VER-06, WAL-20, WAL-21 (Phase 5 Slice 5.4b, read agreed 2026-11-02): the receipts
// phones forward, and their matching to the payments shoppers type. It sits above the phones (ListenerModule) and the
// verifying (PaymentReviewModule, which reaches the public API for Meta); the payment page's routes, the team's and the
// daily pass read it. TenancyModule is imported only for ClientIp's EdgeSecret, as the phones' own module does.
@Module({
  imports: [
    BalanceModule,
    ListenerModule,
    LytroReceiptsModule,
    OrdersModule,
    PaymentReviewModule,
    PaymentSessionsModule,
    TenancyModule,
  ],
  controllers: [ListenerReceiptsController],
  providers: [
    { provide: RECEIPT_STORE, useClass: DrizzleReceiptStore },
    ClientIp,
    ReceiptMatcher,
    ListenerReceipts,
    PaymentSubmissions,
  ],
  exports: [ListenerReceipts, PaymentSubmissions],
})
export class ListenerReceiptsModule {}
