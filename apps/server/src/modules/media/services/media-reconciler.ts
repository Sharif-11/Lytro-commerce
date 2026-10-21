import { Inject, Injectable, Logger } from '@nestjs/common';
import { QueueName } from '@lytronix/validators';
import { StorageUnavailable } from '../../../common/errors/media-refused';
import { tenantPrefix } from '../../../common/media-links';
import type { JobQueue } from '../../shared/queue/ports/job-queue';
import { JOB_QUEUE } from '../../shared/queue/tokens';
import type { MediaNotifier } from '../ports/media-notifier';
import type { MediaStorage, StoredObject } from '../ports/media-storage';
import type { MediaStore } from '../ports/media-store';
import { MEDIA_CLOCK, MEDIA_NOTIFIER, MEDIA_STORAGE, MEDIA_STORE } from '../tokens';
import type { MediaDeletePayload } from './media.service';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// MED-04: a difference above this share of the recorded bytes is an operator alert.
const ALERT_PERCENT = 0.5;
// MED-04: an upload left this long was abandoned; its link expired after 15 minutes.
const ABANDONED_AFTER_MS = DAY_MS;
// STO-09: a video is done within 5 minutes and a job retries for a few more; an hour means the job gave up.
const STUCK_AFTER_MS = HOUR_MS;
// A file written this recently may be one a job is about to record, so it is left out until it settles.
const SETTLING_MS = HOUR_MS;
// A stray file this old is no job's: the deletion job removes it.
const STRAY_DELETE_AFTER_MS = DAY_MS;

/** What one night's run did, for the worker's log line. */
export interface ReconcileResult {
  shops: number;
  differing: number;
  abandoned: number;
  stuck: number;
  straysDeleted: number;
}

/** What the comparison found for one shop. */
interface ShopFindings {
  differing: boolean;
  abandoned: number;
  stuck: number;
  straysDeleted: number;
}

function bytesOf(files: readonly { bytes: number }[]): number {
  return files.reduce((sum, file) => sum + file.bytes, 0);
}

/**
 * MED-04, STO-09: the nightly run, shop by shop. It clears uploads that were started and never finished, refuses items
 * whose processing gave up (and tells the shop), then compares the files the shop's rows record with what R2 holds
 * under its prefix. A shop where they differ is recorded for the operator; a stray file over a day old goes in the
 * deletion job; a recorded file R2 no longer holds is only reported, never dropped from the rows. A difference above
 * 0.5% is an operator alert. A store that is away stops the run, so the job tries again.
 */
@Injectable()
export class MediaReconciler {
  private readonly logger = new Logger('MediaReconcile');

  constructor(
    @Inject(MEDIA_STORE) private readonly store: MediaStore,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(JOB_QUEUE) private readonly jobs: JobQueue,
    @Inject(MEDIA_NOTIFIER) private readonly notifier: MediaNotifier,
    @Inject(MEDIA_CLOCK) private readonly clock: () => Date,
  ) {}

  async runNightly(): Promise<ReconcileResult> {
    const now = this.clock();
    const result: ReconcileResult = {
      shops: 0,
      differing: 0,
      abandoned: 0,
      stuck: 0,
      straysDeleted: 0,
    };
    for (const tenantId of await this.store.listShopIds()) {
      try {
        const found = await this.reconcileShop(tenantId, now);
        result.shops += 1;
        result.differing += found.differing ? 1 : 0;
        result.abandoned += found.abandoned;
        result.stuck += found.stuck;
        result.straysDeleted += found.straysDeleted;
      } catch (error) {
        if (error instanceof StorageUnavailable) {
          // MED-11: operator alert, as a log line until alerting exists (OD-43).
          this.logger.error(
            `media storage unreachable during the nightly run: ${String(error.cause)}`,
          );
          throw error;
        }
        // One shop's failure never stops the others'.
        this.logger.error(`nightly media run failed for tenant ${tenantId}: ${String(error)}`);
      }
    }
    return result;
  }

  private async reconcileShop(tenantId: string, now: Date): Promise<ShopFindings> {
    const at = now.getTime();
    const { abandoned, stuck } = await this.store.run(async (tx) => ({
      abandoned: await this.store.deleteAbandoned(tx, tenantId, new Date(at - ABANDONED_AFTER_MS)),
      stuck: await this.store.failStuck(
        tx,
        tenantId,
        new Date(at - STUCK_AFTER_MS),
        'processing_failed',
      ),
    }));
    for (const item of stuck) {
      await this.notifier.mediaFailed({
        tenantId,
        mediaId: item.id,
        kind: item.kind,
        purpose: item.purpose,
        failure: 'processing_failed',
      });
    }

    const recorded = await this.store.run((tx) => this.store.listRecordedFiles(tx, tenantId));
    const recordedKeys = new Set(recorded.map((file) => file.key));
    const stored = (await this.storage.listMedia(tenantPrefix(tenantId))).filter(
      (object) => recordedKeys.has(object.key) || object.lastModified.getTime() <= at - SETTLING_MS,
    );
    const storedKeys = new Set(stored.map((object) => object.key));
    const missing = recorded.filter((file) => !storedKeys.has(file.key));
    const strays = stored.filter((object) => !recordedKeys.has(object.key));
    const recordedBytes = bytesOf(recorded);
    const storedBytes = bytesOf(stored);
    const found = { abandoned, stuck: stuck.length, straysDeleted: 0 };
    if (missing.length === 0 && strays.length === 0 && storedBytes === recordedBytes) {
      return { ...found, differing: false };
    }

    const oldStrays: StoredObject[] = strays.filter(
      (object) => object.lastModified.getTime() <= at - STRAY_DELETE_AFTER_MS,
    );
    const mismatchPercent =
      recordedBytes === 0 ? 100 : (Math.abs(storedBytes - recordedBytes) / recordedBytes) * 100;
    await this.store.run(async (tx) => {
      await this.store.insertReconciliation(tx, {
        tenantId,
        recordedBytes,
        storedBytes,
        missingFiles: missing.length,
        strayFiles: strays.length,
        straysDeleted: oldStrays.length,
        mismatchPercent: mismatchPercent.toFixed(3),
      });
      if (oldStrays.length > 0) {
        const payload: MediaDeletePayload = { keys: oldStrays.map((object) => object.key) };
        await this.jobs.enqueue(tx, QueueName.MediaDelete, payload);
      }
    });
    if (mismatchPercent > ALERT_PERCENT) {
      // MED-04: operator alert, as a log line until alerting exists (OD-43).
      this.logger.error(
        `media for tenant ${tenantId} differs from R2 by ${mismatchPercent.toFixed(3)}%: ` +
          `${String(missing.length)} recorded files missing, ${String(strays.length)} stray files`,
      );
    }
    return { ...found, straysDeleted: oldStrays.length, differing: true };
  }
}
