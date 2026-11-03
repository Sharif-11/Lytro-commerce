import { Module } from '@nestjs/common';
import { ClientIp } from '../../common/client-ip';
import { ListenerReceiptsModule } from '../listener-receipts/listener-receipts.module';
import { MediaModule } from '../media/media.module';
import { PaymentSessionsModule } from '../payment-sessions/payment-sessions.module';
import { PublicApiModule } from '../public-api/public-api.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { PaymentPageController } from './controllers/payment-page.controller';
import { PaymentPageGuard } from './guards/payment-page.guard';

// PAY-03 to PAY-08, PAY-16, PAY-17, TVR-02 (Slice 5.2): the payment page's own routes, at /v1/pay/<reference>. Apart from
// the public API since Slice 5.4b, because a transaction ID typed meets the receipts, whose verifying tells Meta through
// the public API. It reads that API's visitor limit; TenancyModule is imported only for ClientIp's EdgeSecret.
@Module({
  imports: [
    ListenerReceiptsModule,
    MediaModule,
    PaymentSessionsModule,
    PublicApiModule,
    TenancyModule,
  ],
  controllers: [PaymentPageController],
  providers: [ClientIp, PaymentPageGuard],
})
export class PaymentPageModule {}
