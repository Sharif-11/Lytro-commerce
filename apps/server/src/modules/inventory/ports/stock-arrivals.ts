import type { Transaction } from '@lytronix/db';
import type { ResolvedActor } from '../../catalogue/services/catalogue-activity';
import type { StockChange } from '../types/inventory';

/**
 * INV-06, PUR-07: stock that arrived through a stock route ("Add stock", or a stock edit with "new stock arrived"),
 * checked by the route and handed on to be recorded as a purchase received in full.
 */
export interface StockArrival extends Pick<StockChange, 'batch' | 'batchId'> {
  productId: string;
  /** The variant holding the stock: an ordinary one, or a product's shared stock (INV-24). */
  variantId: string;
  /** In the product's unit, more than zero. */
  quantity: string;
  /** What each unit of it cost, to four decimals; null when not known. */
  unitCost: string | null;
  /** A live supplier named by id, a supplier's name typed, or none. */
  supplier: { id: string } | { name: string } | null;
  note: string | null;
  /** INV-14: the serials of the units arriving, as stored, at most one each. */
  serials: string[];
}

/**
 * What a stock route hands arriving stock to, inside the route's own transaction (PUR-07). Purchasing implements it and
 * the route's caller passes it in, so inventory never depends on purchasing (D3-7); the arrival moves the stock through
 * the stock ledger itself.
 */
export interface StockArrivals {
  arrived(
    tx: Transaction,
    tenantId: string,
    arrival: StockArrival,
    who: ResolvedActor,
  ): Promise<void>;
}
