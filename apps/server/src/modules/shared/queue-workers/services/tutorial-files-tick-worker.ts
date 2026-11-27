import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { TutorialFileSweep } from '../../../tutorials/services/tutorial-file-sweep';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// OPERATOR-CONSOLE-DESIGN §10h: once a night in Asia/Dhaka, after the chat's clean-up (04:25).
const TUTORIAL_FILES_CRON = '40 4 * * *';
const TUTORIAL_FILES_TZ = 'Asia/Dhaka';

/** §10h: the tutorial files replaced or removed 7 days ago, deleted. Safe to run twice. */
@Injectable()
export class TutorialFilesTickWorker implements OnModuleInit {
  private readonly logger = new Logger('TutorialFiles');

  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(TutorialFileSweep) private readonly sweep: TutorialFileSweep,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.TutorialFilesTick);
    await this.pgBoss.boss.schedule(
      QueueName.TutorialFilesTick,
      TUTORIAL_FILES_CRON,
      {},
      { tz: TUTORIAL_FILES_TZ },
    );
    await this.pgBoss.workOnce(QueueName.TutorialFilesTick, async () => {
      const deleted = await this.sweep.run();
      if (deleted > 0) this.logger.log(`old tutorial versions' files deleted: ${String(deleted)}`);
    });
  }
}
