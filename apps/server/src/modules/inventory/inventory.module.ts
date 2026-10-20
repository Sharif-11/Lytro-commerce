import { Module } from '@nestjs/common';
import {
  DrizzleStockCheckStore,
  DrizzleStockStore,
} from '../../database/adapters/inventory.adapter';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { ConsoleLowStockNotifier } from './services/console-low-stock-notifier';
import { InventoryEraser } from './services/inventory-eraser';
import { InventoryFiguresService } from './services/inventory-figures.service';
import { InventoryLedger } from './services/inventory-ledger';
import { StockCheckService } from './services/stock-check.service';
import { StockService } from './services/stock.service';
import { LOW_STOCK_NOTIFIER, STOCK_CHECK_STORE, STOCK_STORE } from './tokens';

// D3-7: the inventory module -- stock levels, the movement ledger, and (in later slices) batches, serials, stock
// checks and reservations. It depends only on catalogue; catalogue reaches it through the stock hooks its callers
// pass, never by importing it.
@Module({
  imports: [CatalogueModule],
  providers: [
    { provide: STOCK_STORE, useClass: DrizzleStockStore },
    { provide: STOCK_CHECK_STORE, useClass: DrizzleStockCheckStore },
    { provide: LOW_STOCK_NOTIFIER, useClass: ConsoleLowStockNotifier },
    InventoryLedger,
    StockService,
    StockCheckService,
    InventoryFiguresService,
    InventoryEraser,
  ],
  exports: [StockService, StockCheckService, InventoryFiguresService, InventoryEraser],
})
export class InventoryModule {}
