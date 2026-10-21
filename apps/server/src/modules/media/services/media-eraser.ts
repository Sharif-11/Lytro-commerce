import { Inject, Injectable } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { tenantPrefix } from '../../../common/media-links';
import type { JobQueue } from '../../shared/queue/ports/job-queue';
import { JOB_QUEUE } from '../../shared/queue/tokens';
import type { BandwidthStore } from '../ports/bandwidth-store';
import type { MediaStore } from '../ports/media-store';
import { BANDWIDTH_STORE, MEDIA_STORE } from '../tokens';
import type { MediaDeletePayload } from './media.service';

/**
 * LIF-19, MED-09: the day-60 deletion job's media step: every media row of the shop and its bandwidth now, and
 * everything stored under its prefix in the deletion job, whose key alone may delete (MED-07). Safe to run again: a
 * second run finds nothing.
 */
@Injectable()
export class MediaEraser {
  constructor(
    @Inject(MEDIA_STORE) private readonly store: MediaStore,
    @Inject(BANDWIDTH_STORE) private readonly bandwidth: BandwidthStore,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
  ) {}

  deleteAllForTenant(tenantId: string): Promise<void> {
    return this.store.run(async (tx) => {
      await this.store.deleteAllForTenant(tx, tenantId);
      await this.bandwidth.deleteAllForTenant(tx, tenantId);
      const payload: MediaDeletePayload = { prefix: tenantPrefix(tenantId) };
      await this.jobs.enqueue(tx, QueueName.MediaDelete, payload);
    });
  }
}
