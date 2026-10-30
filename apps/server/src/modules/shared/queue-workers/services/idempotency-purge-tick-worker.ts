import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { IdempotencyService } from '../../../../common/idempotency/idempotency.service';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// API-11: in the small hours in Asia/Dhaka, when the fewest orders are being made.
const PURGE_TICK_CRON = '30 3 * * *';
const PURGE_TICK_TZ = 'Asia/Dhaka';

/**
 * Registers the daily purge of idempotency keys past their 24 hours (API-11, KNOWN-GAPS §106), a cron like the expiry
 * tick: a key's reply -- for a staff order, the customer's name, phone and address -- is kept only while a retry may
 * need it. Safe to run twice: a second run finds nothing left to delete.
 */
@Injectable()
export class IdempotencyPurgeTickWorker implements OnModuleInit {
  private readonly logger = new Logger('IdempotencyPurgeTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.IdempotencyPurgeTick);
    await this.pgBoss.boss.schedule(
      QueueName.IdempotencyPurgeTick,
      PURGE_TICK_CRON,
      {},
      { tz: PURGE_TICK_TZ },
    );
    await this.pgBoss.boss.work(QueueName.IdempotencyPurgeTick, async () => {
      const gone = await this.idempotency.purgeExpired(new Date());
      this.logger.log(`idempotency purge: ${String(gone)} keys past their 24 hours removed`);
    });
  }
}
