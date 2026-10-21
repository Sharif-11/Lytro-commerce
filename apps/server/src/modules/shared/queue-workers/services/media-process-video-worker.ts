import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { MediaProcessor } from '../../../media/services/media-processor';
import type { MediaProcessPayload } from '../../../media/services/media.service';
import { PgBossClient } from '../../queue/services/pg-boss-client';

// Slice 6 design point 2: one video at a time on each server; compressing one uses two threads (design point 3).
const VIDEOS_AT_ONCE = 1;
// STO-09: a video is done within 5 minutes; the job is given longer before pg-boss counts it lost.
const VIDEO_JOB_SECONDS = 20 * 60;

/**
 * MED-03, STO-09: processes each sent video, one job per item, enqueued by `MediaService.finishUpload` in the same
 * transaction that marks it processing (SCL-08). A store that is away fails the try, and the job tries again later.
 */
@Injectable()
export class MediaProcessVideoWorker implements OnModuleInit {
  constructor(
    @Inject(PgBossClient) private readonly pgBoss: PgBossClient,
    @Inject(MediaProcessor) private readonly processor: MediaProcessor,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.boss.createQueue(QueueName.MediaProcessVideo, {
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      expireInSeconds: VIDEO_JOB_SECONDS,
      notify: true,
    });
    await this.pgBoss.boss.work<MediaProcessPayload>(
      QueueName.MediaProcessVideo,
      { localConcurrency: VIDEOS_AT_ONCE },
      async (jobs) => {
        for (const job of jobs) {
          await this.processor.process(job.data.tenantId, job.data.mediaId);
        }
      },
    );
  }
}
