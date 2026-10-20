import { Module } from '@nestjs/common';
import {
  DrizzlePurchaseOrderStore,
  DrizzlePurchaseReceiptStore,
  DrizzleSupplierStore,
} from '../../database/adapters/purchasing.adapter';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PurchaseOrderService } from './services/purchase-order.service';
import { PurchasingEraser } from './services/purchasing-eraser';
import { ReceivingService } from './services/receiving.service';
import { SupplierService } from './services/supplier.service';
import { PURCHASE_ORDER_STORE, PURCHASE_RECEIPT_STORE, SUPPLIER_STORE } from './tokens';

// D3-7: the purchasing module -- suppliers, purchases and receiving them into stock, including the stock that arrives
// through the stock routes (PUR-07). It depends on inventory, and through it catalogue; neither reaches back into it:
// the stock routes are handed its arrivals by their callers.
@Module({
  imports: [CatalogueModule, InventoryModule],
  providers: [
    { provide: SUPPLIER_STORE, useClass: DrizzleSupplierStore },
    { provide: PURCHASE_ORDER_STORE, useClass: DrizzlePurchaseOrderStore },
    { provide: PURCHASE_RECEIPT_STORE, useClass: DrizzlePurchaseReceiptStore },
    SupplierService,
    PurchaseOrderService,
    ReceivingService,
    PurchasingEraser,
  ],
  exports: [SupplierService, PurchaseOrderService, ReceivingService, PurchasingEraser],
})
export class PurchasingModule {}
