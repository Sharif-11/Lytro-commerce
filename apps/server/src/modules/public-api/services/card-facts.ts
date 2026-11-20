import { Inject, Injectable, Logger } from '@nestjs/common';
import { STOREFRONT_BEST_SELLER_BADGES, STOREFRONT_BEST_SELLER_DAYS } from '@lytronix/validators';
import { DAY_MS } from '../../../common/time';
import type { CardFactsStore } from '../ports/card-facts-store';
import { CARD_FACTS_STORE } from '../tokens';

/** What one pass did, for its log line and the tests. */
export interface CardFactsTickResult {
  shops: number;
  refreshed: number;
  failed: number;
}

/**
 * SB-10 (the owner, 2026-11-20): the minute pass over every shop not deleted. A shop whose kept card facts are due --
 * never worked out, a day old, or a few minutes old with an order changed since -- has them worked out again from its
 * counted orders, so its cards' "ordered" and best-seller facts trail a delivery or a return by 5 minutes at most. Safe
 * to run twice, or beside another pass: a shop another pass holds is left to it. One shop's failure never stops the rest.
 */
@Injectable()
export class CardFacts {
  private readonly logger = new Logger('CardFacts');

  constructor(@Inject(CARD_FACTS_STORE) private readonly store: CardFactsStore) {}

  async runTick(now = new Date()): Promise<CardFactsTickResult> {
    const since = new Date(now.getTime() - STOREFRONT_BEST_SELLER_DAYS * DAY_MS);
    const shops = await this.store.listShopIds();
    const result: CardFactsTickResult = { shops: shops.length, refreshed: 0, failed: 0 };
    for (const shopId of shops) {
      try {
        const refreshed = await this.store.run(async (tx) => {
          if (!(await this.store.due(tx, shopId))) return false;
          await this.store.refresh(tx, shopId, since, STOREFRONT_BEST_SELLER_BADGES);
          return true;
        });
        if (refreshed) result.refreshed += 1;
      } catch (error) {
        result.failed += 1;
        this.logger.error(`card facts couldn't be worked out for tenant ${shopId}`, error as Error);
      }
    }
    return result;
  }
}
