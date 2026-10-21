import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import {
  MediaKind,
  MediaObjectRole,
  MediaStatus,
  QueueName,
  UsageMetric,
} from '@lytronix/validators';
import { MediaRefused } from '../../../common/errors/media-refused';
import { mediaKeys } from '../../../common/media-links';
import type { JobQueue } from '../../shared/queue/ports/job-queue';
import { JOB_QUEUE } from '../../shared/queue/tokens';
import type { MediaNotifier } from '../ports/media-notifier';
import type { MediaStorage } from '../ports/media-storage';
import type { MediaStore } from '../ports/media-store';
import { MEDIA_NOTIFIER, MEDIA_STORAGE, MEDIA_STORE } from '../tokens';
import type { MediaRecord } from '../types/media';
import { ImageProcessor } from './image-processor';
import { UsageWarnings } from '../../usage-warnings/services/usage-warnings';
import { MB, MediaLimits } from './media-limits';
import type { MediaDeletePayload } from './media.service';
import { VideoProcessor } from './video-processor';

const WEBP = 'image/webp';
const MP4 = 'video/mp4';

/** Why an item was refused, as the shop is told: the file's own fault, never sent, or no room left (STO-03). */
type Refusal = MediaRefused['kind'] | 'not_uploaded' | 'storage_full';

/** What processing made of an item: the files to store, and what it is once ready. */
interface Prepared {
  files: { role: MediaObjectRole; key: string; body: Buffer; contentType: string }[];
  width: number;
  height: number;
  durationMs: number | null;
  hash: string;
}

/**
 * MED-03, STO-03 to STO-06, STO-09: the processing job. It reads the sent file from the temporary area and judges it by
 * its content: an image becomes a WebP and its thumbnail, a video an MP4 and its poster. It writes them under the
 * shop's prefix and keeps them only if they still fit the shop's storage, weighed with their real sizes under the
 * shop's storage lock. A refused file stores and counts nothing, and a refused video is told to the shop, which has
 * likely left the upload screen by then. The temporary file is cleared either way. A store that is away throws, so the
 * job tries again.
 */
@Injectable()
export class MediaProcessor {
  constructor(
    @Inject(MEDIA_STORE) private readonly store: MediaStore,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
    @Inject(MEDIA_NOTIFIER) private readonly notifier: MediaNotifier,
    @Inject(ImageProcessor) private readonly images: ImageProcessor,
    @Inject(VideoProcessor) private readonly videos: VideoProcessor,
    @Inject(MediaLimits) private readonly limits: MediaLimits,
    @Inject(UsageWarnings) private readonly warnings: UsageWarnings,
  ) {}

  async process(tenantId: string, mediaId: string): Promise<void> {
    const row = await this.store.run((tx) => this.store.findMedia(tx, tenantId, mediaId));
    // Deleted meanwhile, already finished by an earlier try, or not sent yet: nothing to do.
    if (!row || row.status !== MediaStatus.Processing || row.uploadKey === null) return;
    const uploadKey = row.uploadKey;

    let prepared: Prepared | null;
    try {
      prepared =
        row.kind === MediaKind.Video
          ? await this.prepareVideo(row, uploadKey)
          : await this.prepareImage(row, uploadKey);
    } catch (error) {
      if (error instanceof MediaRefused) {
        await this.refuse(row, error.kind, uploadKey);
        return;
      }
      throw error;
    }
    if (!prepared) {
      await this.refuse(row, 'not_uploaded', uploadKey);
      return;
    }

    const kept = await this.keep(row, prepared);
    await this.storage.removeUpload(uploadKey);
    if (kept === 'storage_full') await this.tell(row, 'storage_full');
  }

  private async prepareImage(row: MediaRecord, uploadKey: string): Promise<Prepared | null> {
    const sent = await this.storage.readUpload(uploadKey);
    if (!sent) return null;
    const processed = await this.images.process(
      sent,
      (await this.limits.maxMb(MediaKind.Image)) * MB,
    );
    const keys = mediaKeys(MediaKind.Image, row.tenantId, row.id, processed.hash);
    return {
      files: [
        {
          role: MediaObjectRole.Main,
          key: keys.main,
          body: processed.main.body,
          contentType: WEBP,
        },
        {
          role: MediaObjectRole.Thumbnail,
          key: keys.thumbnail,
          body: processed.thumbnail.body,
          contentType: WEBP,
        },
      ],
      width: processed.main.width,
      height: processed.main.height,
      durationMs: null,
      hash: processed.hash,
    };
  }

  /** STO-09: a video is worked on as files on disk, never whole in memory; the folder goes when it is done. */
  private async prepareVideo(row: MediaRecord, uploadKey: string): Promise<Prepared | null> {
    const workDir = await mkdtemp(join(tmpdir(), 'lytro-video-'));
    try {
      const input = join(workDir, 'upload');
      if (!(await this.storage.saveUpload(uploadKey, input))) return null;
      const processed = await this.videos.process(
        input,
        workDir,
        (await this.limits.maxMb(MediaKind.Video)) * MB,
      );
      const keys = mediaKeys(MediaKind.Video, row.tenantId, row.id, processed.hash);
      return {
        files: [
          {
            role: MediaObjectRole.Main,
            key: keys.main,
            body: await readFile(processed.video.path),
            contentType: MP4,
          },
          {
            role: MediaObjectRole.Poster,
            key: keys.thumbnail,
            body: processed.poster.body,
            contentType: WEBP,
          },
        ],
        width: processed.video.width,
        height: processed.video.height,
        durationMs: processed.video.durationMs,
        hash: processed.hash,
      };
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  /**
   * STO-01, STO-03: writes the files, then records them only if they still fit the shop's storage; otherwise, or when
   * the item was deleted meanwhile, the deletion job removes what was just written.
   */
  private async keep(
    row: MediaRecord,
    prepared: Prepared,
  ): Promise<'ready' | 'storage_full' | 'gone'> {
    const { tenantId, id: mediaId } = row;
    for (const file of prepared.files) {
      await this.storage.putMedia(file.key, file.body, file.contentType);
    }
    const bytes = prepared.files.reduce((sum, file) => sum + file.body.length, 0);
    const unwritten: MediaDeletePayload = { keys: prepared.files.map((file) => file.key) };

    return this.store.run(async (tx) => {
      await this.store.lockStorage(tx, tenantId);
      const current = await this.store.lockMedia(tx, tenantId, mediaId);
      if (!current || current.status !== MediaStatus.Processing) {
        await this.jobs.enqueue(tx, QueueName.MediaDelete, unwritten);
        return 'gone';
      }
      const limitMb = await this.limits.storageMb(tx, tenantId);
      const stored = await this.store.storedBytes(tx, tenantId);
      if (limitMb !== null && stored + bytes > limitMb * MB) {
        await this.store.finish(tx, tenantId, mediaId, {
          status: MediaStatus.Failed,
          failure: 'storage_full',
        });
        await this.jobs.enqueue(tx, QueueName.MediaDelete, unwritten);
        return 'storage_full';
      }
      await this.store.insertObjects(
        tx,
        tenantId,
        prepared.files.map((file) => ({
          mediaId,
          role: file.role,
          key: file.key,
          bytes: file.body.length,
          contentType: file.contentType,
        })),
      );
      await this.store.finish(tx, tenantId, mediaId, {
        status: MediaStatus.Ready,
        width: prepared.width,
        height: prepared.height,
        durationMs: prepared.durationMs,
        hash: prepared.hash,
      });
      // LIM-01: the storage this file now takes, warned of with its write.
      await this.warnings.check(tx, {
        tenantId,
        metric: UsageMetric.Storage,
        used: stored + bytes,
        limit: limitMb === null ? null : limitMb * MB,
      });
      return 'ready';
    });
  }

  /** MED-03: a refused file is recorded as refused, and its temporary copy is cleared. */
  private async refuse(row: MediaRecord, why: Refusal, uploadKey: string): Promise<void> {
    await this.store.run((tx) =>
      this.store.finish(tx, row.tenantId, row.id, { status: MediaStatus.Failed, failure: why }),
    );
    await this.storage.removeUpload(uploadKey);
    await this.tell(row, why);
  }

  /** STO-09: a refused video is told to the shop; an image's refusal shows on the upload screen still open. */
  private async tell(row: MediaRecord, why: Refusal): Promise<void> {
    if (row.kind !== MediaKind.Video) return;
    await this.notifier.mediaFailed({
      tenantId: row.tenantId,
      mediaId: row.id,
      kind: row.kind,
      purpose: row.purpose,
      failure: why,
    });
  }
}
