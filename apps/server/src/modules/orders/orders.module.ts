import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { DrizzleOrderStore } from '../../database/adapters/orders.adapter';
import { BalanceModule } from '../balance/balance.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { CustomersModule } from '../customers/customers.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { InventoryModule } from '../inventory/inventory.module';
import { StaffModule } from '../staff/staff.module';
import { OrderPricing } from './services/order-pricing';
import { OrderService } from './services/order.service';
import { OrdersEraser } from './services/orders-eraser';
import { ORDER_STORE } from './tokens';

// D4-12: the orders module -- orders, their items, numbering, pricing (D4-9), the call log and status. It depends on
// catalogue, inventory, delivery, balance (the shop's rate per kg) and customers; none of them depends back on it.
@Module({
  imports: [
    BalanceModule,
    CatalogueModule,
    CustomersModule,
    DeliveryModule,
    IdempotencyModule,
    InventoryModule,
    StaffModule,
  ],
  providers: [
    { provide: ORDER_STORE, useClass: DrizzleOrderStore },
    OrderPricing,
    OrderService,
    OrdersEraser,
  ],
  exports: [OrderService, OrderPricing, OrdersEraser],
})
export class OrdersModule {}
