import { Inject, Injectable } from '@nestjs/common';
import { MediaKind, MediaObjectRole, MediaStatus, QueueName } from '@lytronix/validators';
import { MediaRefused } from '../../../common/errors/media-refused';
import { imageKeys } from '../../../common/media-links';
import type { JobQueue } from '../../shared/queue/ports/job-queue';
import { JOB_QUEUE } from '../../shared/queue/tokens';
import type { MediaStorage } from '../ports/media-storage';
import type { MediaStore } from '../ports/media-store';
import { MEDIA_STORAGE, MEDIA_STORE } from '../tokens';
import { ImageProcessor } from './image-processor';
import { MB, MediaLimits } from './media-limits';
import type { MediaDeletePayload } from './media.service';

const WEBP = 'image/webp';

/** Why an item was refused, as the shop is told: the file's own fault, never sent, or no room left (STO-03). */
type Refusal = MediaRefused['kind'] | 'not_uploaded' | 'storage_full';

/**
 * MED-03, STO-03, STO-04, STO-06: the processing job. It reads the sent file from the temporary area, judges it by its
 * content, writes the picture and its thumbnail under the shop's prefix, and keeps them only if they still fit the
 * shop's storage, weighed with their real sizes under the shop's storage lock. A refused file stores and counts
 * nothing. The temporary file is cleared either way. A store that is away throws, so the job tries again.
 */
@Injectable()
export class MediaProcessor {
  constructor(
    @Inject(MEDIA_STORE) private readonly store: MediaStore,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
    @Inject(ImageProcessor) private readonly images: ImageProcessor,
    @Inject(MediaLimits) private readonly limits: MediaLimits,
  ) {}

  async process(tenantId: string, mediaId: string): Promise<void> {
    const row = await this.store.run((tx) => this.store.findMedia(tx, tenantId, mediaId));
    // Deleted meanwhile, already finished by an earlier try, or not sent yet: nothing to do.
    if (!row || row.status !== MediaStatus.Processing || row.uploadKey === null) return;
    const uploadKey = row.uploadKey;
    if (row.kind !== MediaKind.Image) {
      await this.refuse(tenantId, mediaId, 'not_supported', uploadKey);
      return;
    }

    const sent = await this.storage.readUpload(uploadKey);
    if (!sent) {
      await this.refuse(tenantId, mediaId, 'not_uploaded', uploadKey);
      return;
    }
    let processed;
    try {
      processed = await this.images.process(sent, (await this.limits.maxMb(MediaKind.Image)) * MB);
    } catch (error) {
      if (error instanceof MediaRefused) {
        await this.refuse(tenantId, mediaId, error.kind, uploadKey);
        return;
      }
      throw error;
    }

    const keys = imageKeys(tenantId, mediaId, processed.hash);
    await this.storage.putMedia(keys.main, processed.main.body, WEBP);
    await this.storage.putMedia(keys.thumbnail, processed.thumbnail.body, WEBP);
    const bytes = processed.main.bytes + processed.thumbnail.bytes;

    await this.store.run(async (tx) => {
      await this.store.lockStorage(tx, tenantId);
      const current = await this.store.lockMedia(tx, tenantId, mediaId);
      const unwritten: MediaDeletePayload = { keys: [keys.main, keys.thumbnail] };
      if (!current || current.status !== MediaStatus.Processing) {
        // Deleted while it was processing: what was just written goes too.
        await this.jobs.enqueue(tx, QueueName.MediaDelete, unwritten);
        return;
      }
      const limitMb = await this.limits.storageMb(tx, tenantId);
      if (limitMb !== null && (await this.store.storedBytes(tx, tenantId)) + bytes > limitMb * MB) {
        await this.store.finish(tx, tenantId, mediaId, {
          status: MediaStatus.Failed,
          failure: 'storage_full',
        });
        await this.jobs.enqueue(tx, QueueName.MediaDelete, unwritten);
        return;
      }
      await this.store.insertObjects(tx, tenantId, [
        {
          mediaId,
          role: MediaObjectRole.Main,
          key: keys.main,
          bytes: processed.main.bytes,
          contentType: WEBP,
        },
        {
          mediaId,
          role: MediaObjectRole.Thumbnail,
          key: keys.thumbnail,
          bytes: processed.thumbnail.bytes,
          contentType: WEBP,
        },
      ]);
      await this.store.finish(tx, tenantId, mediaId, {
        status: MediaStatus.Ready,
        width: processed.main.width,
        height: processed.main.height,
        hash: processed.hash,
      });
    });
    await this.storage.removeUpload(uploadKey);
  }

  /** MED-03: a refused file is recorded as refused, and its temporary copy is cleared. */
  private async refuse(
    tenantId: string,
    mediaId: string,
    why: Refusal,
    uploadKey: string,
  ): Promise<void> {
    await this.store.run((tx) =>
      this.store.finish(tx, tenantId, mediaId, { status: MediaStatus.Failed, failure: why }),
    );
    await this.storage.removeUpload(uploadKey);
  }
}
