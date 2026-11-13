import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { RequestErrors } from '../../../../common/request-id/request-errors';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// D8-3: once a day, in the quiet hours of Asia/Dhaka (with no zone pg-boss reads a schedule as UTC).
const REQUEST_ERROR_PURGE_CRON = '47 3 * * *';
const REQUEST_ERROR_PURGE_TZ = 'Asia/Dhaka';

/** API-27, D8-3 (Phase 8 Slice 8.1): deletes shops' server faults past the days they are kept (7). Safe to run twice. */
@Injectable()
export class RequestErrorPurgeTickWorker implements OnModuleInit {
  private readonly logger = new Logger('RequestErrorPurgeTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(RequestErrors) private readonly errors: RequestErrors,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.RequestErrorPurgeTick);
    await this.pgBoss.boss.schedule(
      QueueName.RequestErrorPurgeTick,
      REQUEST_ERROR_PURGE_CRON,
      {},
      { tz: REQUEST_ERROR_PURGE_TZ },
    );
    await this.pgBoss.workOnce(QueueName.RequestErrorPurgeTick, async () => {
      const removed = await this.errors.purge(new Date());
      if (removed > 0) this.logger.log(`server fault clean-up: ${String(removed)} removed`);
    });
  }
}
