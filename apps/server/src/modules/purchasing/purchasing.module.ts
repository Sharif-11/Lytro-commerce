import { Module } from '@nestjs/common';
import {
  DrizzlePurchaseOrderStore,
  DrizzleSupplierStore,
} from '../../database/adapters/purchasing.adapter';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PurchaseOrderService } from './services/purchase-order.service';
import { PurchasingEraser } from './services/purchasing-eraser';
import { SupplierService } from './services/supplier.service';
import { PURCHASE_ORDER_STORE, SUPPLIER_STORE } from './tokens';

// D3-7: the purchasing module -- suppliers, purchases and (in Slice 4b) receiving them into stock. It depends on
// inventory, and through it catalogue; neither reaches back into it.
@Module({
  imports: [CatalogueModule, InventoryModule],
  providers: [
    { provide: SUPPLIER_STORE, useClass: DrizzleSupplierStore },
    { provide: PURCHASE_ORDER_STORE, useClass: DrizzlePurchaseOrderStore },
    SupplierService,
    PurchaseOrderService,
    PurchasingEraser,
  ],
  exports: [SupplierService, PurchaseOrderService, PurchasingEraser],
})
export class PurchasingModule {}
