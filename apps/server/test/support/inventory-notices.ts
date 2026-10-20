import type { BatchExpiryNotifier } from '../../src/modules/inventory/ports/stock-batch-store';
import type { LowStockNotifier } from '../../src/modules/inventory/ports/stock-store';
import type {
  BatchExpiryNotice,
  HeldStockExpiredNotice,
  LowStockNotice,
} from '../../src/modules/inventory/types/inventory';

/** Keeps every low-stock notice, in place of the console stand-in. */
export class LowStockCapture implements LowStockNotifier {
  readonly notices: LowStockNotice[] = [];

  lowStock(notice: LowStockNotice): Promise<void> {
    this.notices.push(notice);
    return Promise.resolve();
  }

  for(variantId: string): LowStockNotice[] {
    return this.notices.filter((notice) => notice.variantId === variantId);
  }
}

/** Keeps every expiry notice, and every notice of held stock expiry left short, in place of the console stand-in. */
export class ExpiryCapture implements BatchExpiryNotifier {
  readonly notices: BatchExpiryNotice[] = [];
  readonly shortfalls: HeldStockExpiredNotice[] = [];

  expiringSoon(notice: BatchExpiryNotice): Promise<void> {
    this.notices.push(notice);
    return Promise.resolve();
  }

  heldStockExpired(notice: HeldStockExpiredNotice): Promise<void> {
    this.shortfalls.push(notice);
    return Promise.resolve();
  }

  for(batchId: string): BatchExpiryNotice[] {
    return this.notices.filter((notice) => notice.batchId === batchId);
  }

  shortFor(variantId: string): HeldStockExpiredNotice[] {
    return this.shortfalls.filter((notice) => notice.variantId === variantId);
  }
}
