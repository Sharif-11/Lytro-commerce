import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SelectTutorialVideo } from '@lytronix/db';
import {
  AuditResult,
  PlatformActorType,
  PlatformAuditAction,
  PlatformSettingKey,
  TUTORIAL_SERIES,
  type OperatorTutorialVideoView,
  type OperatorTutorialView,
  type OperatorTutorialsView,
  type TutorialKey,
  type TutorialUploadStartInput,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import { MediaRefused, StorageUnavailable } from '../../../common/errors/media-refused';
import { MediaLinks } from '../../../common/media-links';
import { PlatformAuditService } from '../../audit/services/platform-audit.service';
import type { MediaStorage, SignedUpload } from '../../media/ports/media-storage';
import { MEDIA_STORAGE } from '../../media/tokens';
import { PlatformSettingsService } from '../../platform-settings/services/platform-settings.service';
import type { TutorialStore } from '../ports/tutorial-store';
import { TUTORIAL_CLOCK, TUTORIAL_STORE } from '../tokens';
import { tutorialFileKeys, tutorialPartFrom, tutorialUploadPrefix } from '../tutorial-files';
import { TutorialVideoCheck } from './tutorial-video-check';

// MED-03: the link a browser sends its file to lasts 15 minutes; an 80 MB file goes well within it.
const UPLOAD_LINK_SECONDS = 15 * 60;
// MED-11: how long the console is told to wait while the store is away.
const RETRY_AFTER_SECONDS = 60;

/** Who in Lytro did it, for the audit log. */
export interface TutorialOperator {
  operatorId: string;
  ip: string | null;
}

/**
 * OPERATOR-CONSOLE-DESIGN §10h: Lytro's side of the tutorials -- the series with each part's live file, an upload (a new
 * part's first file, or the next version of a live one), removing one, and the optional YouTube playlist link. An upload
 * is the shops' own path: a signed link to the temporary uploads bucket, then the server checks the file by its content
 * and writes it under `platform/tutorials/` in the public media bucket with the year-long cache header. It claims its
 * version before sending its files and goes live after, so no transaction waits on the store. A replaced or removed file
 * stays 7 days for whoever is watching it; the nightly job deletes it then. Every change is in the audit log.
 */
@Injectable()
export class TutorialDesk {
  private readonly logger = new Logger('Tutorials');

  constructor(
    @Inject(TUTORIAL_STORE) private readonly store: TutorialStore,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(TutorialVideoCheck) private readonly checker: TutorialVideoCheck,
    @Inject(MediaLinks) private readonly links: MediaLinks,
    @Inject(PlatformSettingsService) private readonly settings: PlatformSettingsService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
    @Inject(TUTORIAL_CLOCK) private readonly clock: () => Date,
  ) {}

  async list(): Promise<OperatorTutorialsView> {
    const [live, next, playlistUrl] = await Promise.all([
      this.store.live(),
      this.store.nextVersions(),
      this.playlist(),
    ]);
    return {
      parts: TUTORIAL_SERIES.map((part) =>
        this.rowOf(
          part.key,
          live.find((row) => row.tutorialKey === part.key) ?? null,
          next.get(part.key) ?? 1,
        ),
      ),
      playlistUrl,
    };
  }

  /** §10h: a signed link the console may PUT one MP4 to, for this part. */
  async startUpload(
    key: string,
    input: TutorialUploadStartInput,
  ): Promise<{ uploadKey: string; upload: SignedUpload }> {
    const part = tutorialPartFrom(key);
    const uploadKey = `${tutorialUploadPrefix(part.key)}${randomUUID()}`;
    const upload = await this.reaching(() =>
      this.storage.signUpload(uploadKey, input.contentType, input.bytes, UPLOAD_LINK_SECONDS),
    );
    return { uploadKey, upload };
  }

  /**
   * §10h: the uploaded file, checked and made live at once -- the part's first file, or the next version of its live one,
   * which is retired (its file deleted 7 days later; sellers who watched it keep their ✓).
   */
  async publish(
    key: string,
    uploadKey: string,
    operator: TutorialOperator,
  ): Promise<OperatorTutorialView> {
    const part = tutorialPartFrom(key);
    if (!uploadKey.startsWith(tutorialUploadPrefix(part.key))) {
      throw new ApiError('validation_error', 'TutorialFileNotUploaded', {});
    }
    const workDir = await mkdtemp(join(tmpdir(), 'lytro-tutorial-'));
    try {
      const checked = await this.reaching(() =>
        this.checker.check(uploadKey, workDir).catch((error: unknown) => {
          if (error instanceof MediaRefused)
            throw new ApiError('validation_error', 'TutorialFileNotMp4', {});
          throw error;
        }),
      );
      const claimed = await this.store.run((tx) =>
        this.store.claim(
          tx,
          {
            tutorialKey: part.key,
            durationSeconds: checked.durationSeconds,
            bytes: checked.bytes,
            width: checked.width,
            height: checked.height,
            uploadedBy: operator.operatorId,
          },
          (version) => tutorialFileKeys(part.key, version),
        ),
      );
      try {
        await this.reaching(async () => {
          await this.storage.putMedia(
            claimed.videoKey,
            await readFile(checked.videoPath),
            'video/mp4',
          );
          await this.storage.putMedia(claimed.coverKey, checked.cover, 'image/jpeg');
        });
      } catch (error) {
        // Not live, so retired at once: whatever reached the store goes with the old files.
        await this.store.run((tx) =>
          this.store.retire(tx, claimed.id, this.clock(), operator.operatorId),
        );
        throw error;
      }
      const live = await this.goLive(claimed, operator);
      await this.storage.removeUpload(uploadKey).catch((error: unknown) => {
        this.logger.warn(`a tutorial's upload was not cleared: ${String(error)}`);
      });
      return this.rowOf(part.key, live, live.version + 1);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  /** §10h: the part's row leaves every shop's screens and Menu › Tutorials shows it as coming soon; the file goes in 7 days. */
  async remove(key: string, operator: TutorialOperator): Promise<OperatorTutorialView> {
    const part = tutorialPartFrom(key);
    const at = this.clock();
    await this.store.run(async (tx) => {
      await this.store.lockPart(tx, part.key);
      const live = await this.store.liveOf(tx, part.key);
      if (!live) throw new ApiError('conflict', 'TutorialHasNoVideo', {});
      await this.store.retire(tx, live.id, at, operator.operatorId);
      await this.audit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: operator.operatorId,
        action: PlatformAuditAction.TutorialRemoved,
        targetType: 'tutorial',
        targetId: live.id,
        result: AuditResult.Success,
        ip: operator.ip,
        summary: { tutorialKey: part.key, version: live.version, file: live.videoKey },
      });
    });
    const next = await this.store.nextVersions();
    return this.rowOf(part.key, null, next.get(part.key) ?? 1);
  }

  /** §10h: the optional playlist link; empty takes Menu › Tutorials' YouTube line away. Audited as a setting. */
  async setPlaylist(
    playlistUrl: string | null,
    operatorId: string,
  ): Promise<{ playlistUrl: string | null }> {
    await this.settings.set(PlatformSettingKey.TutorialsPlaylistUrl, playlistUrl ?? '', operatorId);
    return { playlistUrl: await this.playlist() };
  }

  /** The playlist link, or null while none is set. */
  async playlist(): Promise<string | null> {
    const value = (await this.settings.current(PlatformSettingKey.TutorialsPlaylistUrl))?.value;
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  /** The claimed version goes live, retiring the live one -- unless a later version went live meanwhile. */
  private async goLive(
    claimed: SelectTutorialVideo,
    operator: TutorialOperator,
  ): Promise<SelectTutorialVideo> {
    const at = this.clock();
    return this.store.run(async (tx) => {
      await this.store.lockPart(tx, claimed.tutorialKey);
      const live = await this.store.liveOf(tx, claimed.tutorialKey);
      if (live && live.version > claimed.version) {
        await this.store.retire(tx, claimed.id, at, operator.operatorId);
        throw new ApiError('conflict', 'TutorialChangedMeanwhile', {});
      }
      if (live) await this.store.retire(tx, live.id, at, operator.operatorId);
      await this.store.publish(tx, claimed.id, at);
      await this.audit.recordWithin(tx, {
        actorType: PlatformActorType.Operator,
        actorId: operator.operatorId,
        action: live ? PlatformAuditAction.TutorialReplaced : PlatformAuditAction.TutorialUploaded,
        targetType: 'tutorial',
        targetId: claimed.id,
        result: AuditResult.Success,
        ip: operator.ip,
        summary: {
          tutorialKey: claimed.tutorialKey,
          version: claimed.version,
          file: claimed.videoKey,
          durationSeconds: claimed.durationSeconds,
          bytes: claimed.bytes,
          ...(live ? { was: live.videoKey } : {}),
        },
      });
      return { ...claimed, publishedAt: at };
    });
  }

  private rowOf(
    key: TutorialKey,
    live: SelectTutorialVideo | null,
    nextVersion: number,
  ): OperatorTutorialView {
    return {
      key,
      video: live ? this.videoOf(live) : null,
      nextFile: tutorialFileKeys(key, nextVersion).videoKey,
    };
  }

  private videoOf(row: SelectTutorialVideo): OperatorTutorialVideoView {
    return {
      url: this.links.url(row.videoKey),
      coverUrl: this.links.url(row.coverKey),
      durationSeconds: row.durationSeconds,
      version: row.version,
      file: row.videoKey,
      bytes: row.bytes,
      width: row.width,
      height: row.height,
      uploadedAt: (row.publishedAt ?? row.uploadedAt).toISOString(),
    };
  }

  /** A store that can't be reached is "try again in a minute", never a server fault. */
  private async reaching<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof StorageUnavailable) {
        this.logger.warn(`the media store could not be reached for a tutorial: ${error.message}`);
        throw new ApiError('service_unavailable', 'StorageUnavailable', {}, RETRY_AFTER_SECONDS);
      }
      throw error;
    }
  }
}
