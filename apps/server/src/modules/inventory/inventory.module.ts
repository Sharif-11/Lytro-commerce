import { Module } from '@nestjs/common';
import {
  DrizzleSerialStore,
  DrizzleStockBatchStore,
  DrizzleStockCheckStore,
  DrizzleStockStore,
} from '../../database/adapters/inventory.adapter';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { BatchExpiryService } from './services/batch-expiry.service';
import { BatchService } from './services/batch.service';
import { ConsoleBatchExpiryNotifier } from './services/console-batch-expiry-notifier';
import { ConsoleLowStockNotifier } from './services/console-low-stock-notifier';
import { InventoryEraser } from './services/inventory-eraser';
import { InventoryFiguresService } from './services/inventory-figures.service';
import { InventoryLedger } from './services/inventory-ledger';
import { SerialEntryService } from './services/serial-entry.service';
import { SerialService } from './services/serial.service';
import { StockCheckService } from './services/stock-check.service';
import { StockService } from './services/stock.service';
import {
  BATCH_EXPIRY_NOTIFIER,
  LOW_STOCK_NOTIFIER,
  SERIAL_STORE,
  STOCK_BATCH_STORE,
  STOCK_CHECK_STORE,
  STOCK_STORE,
} from './tokens';

// D3-7: the inventory module -- stock levels, the movement ledger, and (in later slices) batches, serials, stock
// checks and reservations. It depends only on catalogue; catalogue reaches it through the stock hooks its callers
// pass, never by importing it.
@Module({
  imports: [CatalogueModule],
  providers: [
    { provide: STOCK_STORE, useClass: DrizzleStockStore },
    { provide: STOCK_CHECK_STORE, useClass: DrizzleStockCheckStore },
    { provide: STOCK_BATCH_STORE, useClass: DrizzleStockBatchStore },
    { provide: SERIAL_STORE, useClass: DrizzleSerialStore },
    { provide: BATCH_EXPIRY_NOTIFIER, useClass: ConsoleBatchExpiryNotifier },
    { provide: LOW_STOCK_NOTIFIER, useClass: ConsoleLowStockNotifier },
    InventoryLedger,
    StockService,
    StockCheckService,
    InventoryFiguresService,
    BatchService,
    BatchExpiryService,
    SerialEntryService,
    SerialService,
    InventoryEraser,
  ],
  exports: [
    // The one write path for stock, and the serial checks, for purchasing's receipts (D3-7: purchasing -> inventory).
    InventoryLedger,
    SerialEntryService,
    SerialService,
    StockService,
    StockCheckService,
    InventoryFiguresService,
    BatchService,
    BatchExpiryService,
    InventoryEraser,
  ],
})
export class InventoryModule {}
