import type { Transaction } from '@lytronix/db';
import type { PackAutoBuy } from '../types/pack-auto-buy';

/** BND-04, RTE-11: hands a pack to buy on, in the caller's own transaction (SCL-08). */
export interface PackAutoBuys {
  queue(tx: Transaction, buy: PackAutoBuy): Promise<void>;
}
