import { Module } from '@nestjs/common';
import { join } from 'node:path';
import { ClientIp } from '../../common/client-ip';
import type { Env } from '../../config/env';
import { ENV } from '../../config/tokens';
import { BalanceModule } from '../balance/balance.module';
import { DomainsModule } from '../domains/domains.module';
import { GatewayModule } from '../gateway/gateway.module';
import { ListenerReceiptsModule } from '../listener-receipts/listener-receipts.module';
import { LytroPaymentsModule } from '../lytro-payments/lytro-payments.module';
import { MediaModule } from '../media/media.module';
import { PaymentSessionsModule } from '../payment-sessions/payment-sessions.module';
import { PublicApiModule } from '../public-api/public-api.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { PaymentPageAssetsController } from './controllers/payment-page-assets.controller';
import { PaymentPageHtmlController } from './controllers/payment-page-html.controller';
import { PaymentPageController } from './controllers/payment-page.controller';
import { PaymentPageErrors } from './filters/payment-page-errors.filter';
import { PaymentPageHostGuard } from './guards/payment-page-host.guard';
import { PaymentPageGuard } from './guards/payment-page.guard';
import { PaymentPageAssets } from './services/payment-page-assets';
import { PaymentPageHost } from './services/payment-page-host';
import { PaymentPageReader } from './services/payment-page-reader';
import { PAY_PAGE_ASSETS_DIR, PAY_PAGE_MEDIA_ORIGIN } from './tokens';

// PAY-03 to PAY-08, PAY-16, PAY-17, TVR-02 (Slice 5.2): the payment page's own routes, at /v1/pay/<reference>. Apart from
// the public API since Slice 5.4b, because a transaction ID typed meets the receipts, whose verifying tells Meta through
// the public API. It reads that API's visitor limit; TenancyModule is imported only for ClientIp's EdgeSecret.
@Module({
  imports: [
    BalanceModule,
    DomainsModule,
    GatewayModule,
    ListenerReceiptsModule,
    LytroPaymentsModule,
    MediaModule,
    PaymentSessionsModule,
    PublicApiModule,
    TenancyModule,
  ],
  controllers: [PaymentPageController, PaymentPageHtmlController, PaymentPageAssetsController],
  providers: [
    { provide: PAY_PAGE_ASSETS_DIR, useValue: join(__dirname, '..', '..', '..', 'assets', 'pay') },
    {
      provide: PAY_PAGE_MEDIA_ORIGIN,
      inject: [ENV],
      useFactory: (env: Env): string | undefined => env.MEDIA_PUBLIC_BASE_URL,
    },
    ClientIp,
    PaymentPageAssets,
    PaymentPageErrors,
    PaymentPageGuard,
    PaymentPageHost,
    PaymentPageHostGuard,
    PaymentPageReader,
  ],
  exports: [PaymentPageHost],
})
export class PaymentPageModule {}
