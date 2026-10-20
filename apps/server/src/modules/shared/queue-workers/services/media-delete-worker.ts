import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { MediaDeleter } from '../../../media/services/media-deleter';
import type { MediaDeletePayload } from '../../../media/services/media.service';
import { PgBossClient } from '../../queue/services/pg-boss-client';

/**
 * MED-07, MED-09, LIF-19: removes stored files once their rows are gone -- deleted media, or a lapsed shop's whole
 * prefix at day 60. Enqueued in the transaction that deleted the rows (SCL-08); a store that is away fails the try,
 * and the job tries again later.
 */
@Injectable()
export class MediaDeleteWorker implements OnModuleInit {
  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(MediaDeleter) private readonly deleter: MediaDeleter,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.MediaDelete, {
      retryLimit: 10,
      retryDelay: 30,
      retryBackoff: true,
      notify: true,
    });
    await this.pgBoss.boss.work<MediaDeletePayload>(QueueName.MediaDelete, async (jobs) => {
      for (const job of jobs) {
        await this.deleter.delete(job.data);
      }
    });
  }
}
