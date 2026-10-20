import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { MediaProcessor } from '../../../media/services/media-processor';
import type { MediaProcessPayload } from '../../../media/services/media.service';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// Slice 6 design point 2: images are processed two at a time on each server.
const IMAGES_AT_ONCE = 2;

/**
 * MED-03: processes each sent file, one job per item, enqueued by `MediaService.finishUpload` in the same transaction
 * that marks it processing (SCL-08). A store that is away fails the try, and the job tries again later (MED-11).
 */
@Injectable()
export class MediaProcessWorker implements OnModuleInit {
  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(MediaProcessor) private readonly processor: MediaProcessor,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.MediaProcess, {
      retryLimit: 5,
      retryDelay: 10,
      retryBackoff: true,
      notify: true,
    });
    await this.pgBoss.boss.work<MediaProcessPayload>(
      QueueName.MediaProcess,
      { localConcurrency: IMAGES_AT_ONCE },
      async (jobs) => {
        for (const job of jobs) {
          await this.processor.process(job.data.tenantId, job.data.mediaId);
        }
      },
    );
  }
}
