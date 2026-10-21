import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { MediaReconciler } from '../../../media/services/media-reconciler';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// MED-04: once a night, at 03:00 in Asia/Dhaka, when the shops are quiet.
const RECONCILE_CRON = '0 3 * * *';
const RECONCILE_TZ = 'Asia/Dhaka';

/**
 * Registers the nightly media run (MED-04), a cron like the expiry tick: there is no single business transaction to
 * anchor it to. Running it twice finds nothing more to do.
 */
@Injectable()
export class MediaReconcileTickWorker implements OnModuleInit {
  private readonly logger = new Logger('MediaReconcileTick');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(MediaReconciler) private readonly reconciler: MediaReconciler,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.MediaReconcileTick);
    await this.pgBoss.boss.schedule(
      QueueName.MediaReconcileTick,
      RECONCILE_CRON,
      {},
      {
        tz: RECONCILE_TZ,
      },
    );
    await this.pgBoss.boss.work(QueueName.MediaReconcileTick, async () => {
      const result = await this.reconciler.runNightly();
      this.logger.log(
        `media run: ${String(result.shops)} shops, ${String(result.differing)} differing, ` +
          `${String(result.abandoned)} abandoned uploads, ${String(result.stuck)} stuck, ` +
          `${String(result.straysDeleted)} stray files deleted`,
      );
    });
  }
}
