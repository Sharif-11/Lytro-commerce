import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { CardFacts } from '../../../public-api/services/card-facts';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// SB-10 (the owner, 2026-11-20): every minute, so a shop's cards trail its orders by 5 minutes at most
// (CARD_FACTS_REFRESH_AFTER_MINUTES, then the next minute).
const CARD_FACTS_CRON = '* * * * *';

/** Registers the card facts pass (SB-10), a cron like the reservation expiry pass. Safe to run twice. */
@Injectable()
export class CardFactsTickWorker implements OnModuleInit {
  private readonly logger = new Logger('CardFactsTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(CardFacts) private readonly facts: CardFacts,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.CardFactsTick);
    await this.pgBoss.boss.schedule(QueueName.CardFactsTick, CARD_FACTS_CRON, {});
    await this.pgBoss.workOnce(QueueName.CardFactsTick, async () => {
      const result = await this.facts.runTick(new Date());
      if (result.refreshed > 0 || result.failed > 0) {
        this.logger.log(
          `card facts: ${String(result.refreshed)} of ${String(result.shops)} shops worked out again` +
            (result.failed > 0 ? `, ${String(result.failed)} failed` : ''),
        );
      }
    });
  }
}
