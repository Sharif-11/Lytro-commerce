import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { DrizzleOrderStore } from '../../database/adapters/orders.adapter';
import { BalanceModule } from '../balance/balance.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { CustomersModule } from '../customers/customers.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { StaffModule } from '../staff/staff.module';
import { UsageWarningsModule } from '../usage-warnings/usage-warnings.module';
import { ConsoleOrderNotifier } from './services/console-order-notifier';
import { HandlingQuota } from './services/handling-quota';
import { OrderFulfilment } from './services/order-fulfilment';
import { OrderPayments } from './services/order-payments';
import { OrderPricing } from './services/order-pricing';
import { OrderTracking } from './services/order-tracking';
import { OrderService } from './services/order.service';
import { OrdersEraser } from './services/orders-eraser';
import { PaymentRecorder } from './services/payment-recorder';
import { ORDER_NOTIFIER, ORDER_STORE } from './tokens';

// D4-12: the orders module -- orders, their items, numbering, pricing (D4-9), the call log, status and tracking
// (ORD-17), the notice of a shopper's order (ORD-20, D4-10), moving an order by hand with its handling limits
// (Slice 4.3), and the payments staff record on it (Slice 4.3b). It depends on catalogue, inventory, delivery, balance (the shop's rate per kg, the pay-as-you-go fee),
// customers and the usage warnings; none of them depends back on it.
@Module({
  imports: [
    BalanceModule,
    CatalogueModule,
    CustomersModule,
    DeliveryModule,
    IdempotencyModule,
    InventoryModule,
    PlatformSettingsModule,
    StaffModule,
    UsageWarningsModule,
  ],
  providers: [
    { provide: ORDER_STORE, useClass: DrizzleOrderStore },
    { provide: ORDER_NOTIFIER, useClass: ConsoleOrderNotifier },
    HandlingQuota,
    OrderFulfilment,
    OrderPayments,
    OrderPricing,
    OrderService,
    OrderTracking,
    OrdersEraser,
    PaymentRecorder,
  ],
  exports: [
    HandlingQuota,
    OrderFulfilment,
    OrderPayments,
    OrderService,
    OrderPricing,
    OrderTracking,
    OrdersEraser,
    ORDER_NOTIFIER,
  ],
})
export class OrdersModule {}
