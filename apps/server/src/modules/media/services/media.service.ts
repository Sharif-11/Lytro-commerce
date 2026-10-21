import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  AuditAction,
  FieldProblemCode,
  MediaKind,
  MediaPurpose,
  MediaStatus,
  Permission,
  QueueName,
  ServerFieldProblemCode,
  UsageMetric,
  type MediaListQuery,
  type StartUploadInput,
} from '@lytronix/validators';
import { ApiError, FieldsError } from '../../../common/api-error';
import { StorageUnavailable } from '../../../common/errors/media-refused';
import type { MessageKey } from '../../../common/i18n/message-key';
import { MediaLinks, type ImageView } from '../../../common/media-links';
import { CatalogueActivity } from '../../catalogue/services/catalogue-activity';
import { CatalogueImages, refuseUnattachable } from '../../catalogue/services/catalogue-images';
import { CatalogueVersion } from '../../catalogue/services/catalogue-version';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import type { JobQueue } from '../../shared/queue/ports/job-queue';
import { JOB_QUEUE } from '../../shared/queue/tokens';
import type { MediaStorage, SignedUpload } from '../ports/media-storage';
import type { MediaStore } from '../ports/media-store';
import { MEDIA_STORAGE, MEDIA_STORE } from '../tokens';
import type {
  MediaDetail,
  MediaObjectRecord,
  MediaPage,
  MediaRecord,
  MediaView,
  StorageUsage,
  UploadStarted,
} from '../types/media';
import { MB, MediaLimits } from './media-limits';

// MED-03: the link a browser sends its file to lasts 15 minutes.
const UPLOAD_LINK_SECONDS = 15 * 60;
// MED-11: how long the shop is told to wait before trying again while the store is away.
const RETRY_AFTER_SECONDS = 60;

/** The job that processes one sent file (MED-03). */
export interface MediaProcessPayload {
  tenantId: string;
  mediaId: string;
}

/** The job that removes stored files (MED-07, MED-09): these keys, or everything under a shop's prefix (LIF-19). */
export type MediaDeletePayload = { keys: string[] } | { prefix: string };

// MED-03, STF-11: what starting, finishing or deleting media of each purpose needs: the logo is a shop setting,
// everything else is the catalogue's.
export const MEDIA_PURPOSE_PERMISSION: Readonly<Record<MediaPurpose, Permission>> = {
  [MediaPurpose.ProductImage]: Permission.ProductsManage,
  [MediaPurpose.ProductVideo]: Permission.ProductsManage,
  [MediaPurpose.CategoryImage]: Permission.ProductsManage,
  [MediaPurpose.SwatchImage]: Permission.ProductsManage,
  [MediaPurpose.SizeChartImage]: Permission.ProductsManage,
  [MediaPurpose.ShopLogo]: Permission.SettingsManage,
};

// MED-03: the place an upload names, and the message when it is not there.
const TARGETS: Partial<
  Record<MediaPurpose, { kind: 'product' | 'category' | 'option'; notFound: MessageKey }>
> = {
  [MediaPurpose.ProductImage]: { kind: 'product', notFound: 'ProductNotFound' },
  [MediaPurpose.ProductVideo]: { kind: 'product', notFound: 'ProductNotFound' },
  [MediaPurpose.CategoryImage]: { kind: 'category', notFound: 'CategoryNotFound' },
  [MediaPurpose.SwatchImage]: { kind: 'option', notFound: 'OptionNotFound' },
};

/**
 * MED-03, MED-09, STO-01 to STO-03, STO-07, TEN-16: a shop's media. An upload starts with only the file's details --
 * checked against the per-file limit, the shop's storage and the place it is for -- and is answered with a link the
 * browser sends the file to; finishing hands the file to the processing job. Deleting an item removes it from
 * everywhere it shows at once; its stored files go in the deletion job.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger('Media');

  constructor(
    @Inject(MEDIA_STORE) private readonly store: MediaStore,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
    @Inject(MediaLimits) private readonly limits: MediaLimits,
    @Inject(MediaLinks) private readonly links: MediaLinks,
    @Inject(CatalogueImages) private readonly images: CatalogueImages,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(CatalogueVersion) private readonly version: CatalogueVersion,
  ) {}

  async startUpload(
    tenantId: string,
    input: StartUploadInput,
    actor: CatalogueActor,
  ): Promise<UploadStarted> {
    // STO-04, STO-05: the largest file of its kind.
    const maxMb = await this.limits.maxMb(input.kind);
    if (input.bytes > maxMb * MB) {
      throw new FieldsError([
        {
          field: 'bytes',
          problem: FieldProblemCode.TooLarge,
          messageKey: input.kind === MediaKind.Video ? 'VideoTooLarge' : 'ImageTooLarge',
          params: { mb: maxMb },
          max: maxMb * MB,
        },
      ]);
    }
    const who = await this.activity.resolve(tenantId, actor);
    const id = randomUUID();
    const uploadKey = `${tenantId}/${id}`;
    return this.store.run(async (tx) => {
      if (input.targetId !== undefined) {
        await this.refuseMissingTarget(tx, tenantId, input.purpose, input.targetId);
      }
      // STO-03: refused before any file is sent when it cannot fit; checked again with the stored sizes at the end.
      await this.refuseOverStorage(tx, tenantId, input.bytes);
      const row = await this.store.insertMedia(tx, tenantId, {
        id,
        kind: input.kind,
        purpose: input.purpose,
        targetId: input.targetId ?? null,
        uploadKey,
        contentType: input.contentType,
        declaredBytes: input.bytes,
        createdBy: who.id,
      });
      const upload = await this.signed(uploadKey, input.contentType, input.bytes);
      return { media: this.view(tenantId, row, []), upload };
    });
  }

  /** MED-03: the file was sent; it is processed in the background. Finishing again, or a finished item, changes nothing. */
  async finishUpload(tenantId: string, id: string): Promise<MediaView> {
    return this.store.run(async (tx) => {
      const row = await this.store.lockMedia(tx, tenantId, id);
      if (!row) throw new ApiError('not_found', 'MediaNotFound', {});
      if (row.status !== MediaStatus.Uploading) {
        return this.view(tenantId, row, await this.store.listObjects(tx, tenantId, [id]));
      }
      await this.store.markProcessing(tx, tenantId, id);
      const payload: MediaProcessPayload = { tenantId, mediaId: id };
      // Design point 2: videos queue apart, so one compresses at a time while images go two at a time.
      const queue =
        row.kind === MediaKind.Video ? QueueName.MediaProcessVideo : QueueName.MediaProcess;
      await this.jobs.enqueue(tx, queue, payload, { singletonKey: id });
      return this.view(tenantId, { ...row, status: MediaStatus.Processing }, []);
    });
  }

  /** MED-03, STF-11: what the item was uploaded for, which decides who may finish or delete it. */
  async purposeOf(tenantId: string, id: string): Promise<MediaPurpose> {
    const row = await this.store.run((tx) => this.store.findMedia(tx, tenantId, id));
    if (!row) throw new ApiError('not_found', 'MediaNotFound', {});
    return row.purpose;
  }

  /** MED-09: one item, and every place it shows, so deleting it can say what it leaves. */
  async get(tenantId: string, id: string): Promise<MediaDetail> {
    return this.store.run(async (tx) => {
      const row = await this.store.findMedia(tx, tenantId, id);
      if (!row) throw new ApiError('not_found', 'MediaNotFound', {});
      const [objects, uses] = await Promise.all([
        this.store.listObjects(tx, tenantId, [id]),
        this.store.usesOf(tx, tenantId, id),
      ]);
      // ORD-46: past orders whose lines show it arrive with orders (Phase 4); until then there are none.
      return { ...this.view(tenantId, row, objects), uses: { ...uses, pastOrders: 0 } };
    });
  }

  /** MED-09: the shop's ready media, newest first. */
  async list(tenantId: string, query: MediaListQuery): Promise<MediaPage> {
    return this.store.run(async (tx) => {
      const { rows, total } = await this.store.listReady(tx, tenantId, {
        kind: query.kind ?? null,
        offset: (query.page - 1) * query.limit,
        limit: query.limit,
      });
      const objects = await this.store.listObjects(
        tx,
        tenantId,
        rows.map((row) => row.id),
      );
      return {
        media: rows.map((row) =>
          this.view(
            tenantId,
            row,
            objects.filter((object) => object.mediaId === row.id),
          ),
        ),
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      };
    });
  }

  /** STO-01, STO-02: what the shop stores now, and its limit. */
  async usage(tenantId: string): Promise<StorageUsage> {
    return this.store.run(async (tx) => {
      const [usedBytes, limitMb] = await Promise.all([
        this.store.storedBytes(tx, tenantId),
        this.limits.storageMb(tx, tenantId),
      ]);
      return { usedBytes, limitBytes: limitMb === null ? null : limitMb * MB };
    });
  }

  /**
   * MED-09, STO-07: deletes the item -- it leaves every product, category, swatch and logo it showed on, and an image
   * size chart goes with its image -- so usage drops at once; its stored files go in the deletion job (MED-07).
   */
  async delete(tenantId: string, id: string, actor: CatalogueActor): Promise<void> {
    const who = await this.activity.resolve(tenantId, actor);
    await this.store.run(async (tx) => {
      const row = await this.store.lockMedia(tx, tenantId, id);
      if (!row) throw new ApiError('not_found', 'MediaNotFound', {});
      const uses = await this.store.usesOf(tx, tenantId, id);
      const keys = await this.store.deleteMedia(tx, tenantId, id);
      if (keys.length > 0) {
        const payload: MediaDeletePayload = { keys };
        await this.jobs.enqueue(tx, QueueName.MediaDelete, payload);
      }
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.MediaDeleted,
        { type: 'media', id },
        { kind: row.kind, purpose: row.purpose, uses },
      );
      // CCH-02: what the public pages show changed only when it showed somewhere.
      const shown =
        uses.products + uses.videos + uses.categories + uses.swatches + uses.sizeCharts > 0 ||
        uses.logo;
      if (shown) await this.version.bump(tx, tenantId);
    });
  }

  /** TEN-16: the shop's logo, or null for its monogram. */
  async logoOf(tenantId: string): Promise<ImageView | null> {
    return this.store.run(async (tx) => {
      const id = await this.store.shopLogo(tx, tenantId);
      return id === null ? null : ((await this.images.viewsOf(tx, tenantId, [id])).get(id) ?? null);
    });
  }

  /** TEN-16: sets the shop's logo to one of its ready images, or none. */
  async setLogo(
    tenantId: string,
    mediaId: string | null,
    actor: CatalogueActor,
  ): Promise<ImageView | null> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(async (tx) => {
      try {
        await this.store.setShopLogo(tx, tenantId, mediaId);
      } catch (error) {
        refuseUnattachable(error, 'mediaId');
      }
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.ShopLogoSaved,
        { type: 'tenant', id: tenantId },
        { mediaId },
      );
      await this.version.bump(tx, tenantId);
      return mediaId === null
        ? null
        : ((await this.images.viewsOf(tx, tenantId, [mediaId])).get(mediaId) ?? null);
    });
  }

  private async refuseMissingTarget(
    tx: Transaction,
    tenantId: string,
    purpose: MediaPurpose,
    targetId: string,
  ): Promise<void> {
    const target = TARGETS[purpose];
    if (!target) return;
    if (!(await this.store.targetExists(tx, tenantId, { kind: target.kind, id: targetId }))) {
      throw new FieldsError([
        {
          field: 'targetId',
          problem: ServerFieldProblemCode.NotFound,
          messageKey: target.notFound,
        },
      ]);
    }
  }

  /** STO-03, PLN-19: refused with plan_limit_reached when these bytes would not fit; existing media stays. */
  private async refuseOverStorage(tx: Transaction, tenantId: string, bytes: number): Promise<void> {
    const limitMb = await this.limits.storageMb(tx, tenantId);
    if (limitMb === null) return;
    if ((await this.store.storedBytes(tx, tenantId)) + bytes > limitMb * MB) {
      throw new ApiError(
        'plan_limit_reached',
        'StorageLimitReached',
        { metric: UsageMetric.Storage, storage_mb: limitMb },
        undefined,
        { mb: limitMb },
      );
    }
  }

  /** MED-11: the store being away answers 503 with when to try again, and nothing is kept. */
  private async signed(key: string, contentType: string, bytes: number): Promise<SignedUpload> {
    try {
      return await this.storage.signUpload(key, contentType, bytes, UPLOAD_LINK_SECONDS);
    } catch (error) {
      if (error instanceof StorageUnavailable) {
        // MED-11: operator alert, as a log line until alerting exists (OD-43): the media store cannot be reached.
        this.logger.error(
          `media storage unreachable while starting an upload: ${String(error.cause)}`,
        );
        throw new ApiError('service_unavailable', 'StorageUnavailable', {}, RETRY_AFTER_SECONDS);
      }
      throw error;
    }
  }

  private view(tenantId: string, row: MediaRecord, objects: MediaObjectRecord[]): MediaView {
    const urls =
      row.status === MediaStatus.Ready && row.hash !== null
        ? this.links.urls(row.kind, tenantId, row.id, row.hash)
        : null;
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      purpose: row.purpose,
      width: row.width,
      height: row.height,
      bytes: objects.reduce((sum, object) => sum + object.bytes, 0),
      durationMs: row.durationMs,
      urls,
      failure: row.failure,
      createdAt: row.createdAt,
    };
  }
}
