import { Module } from '@nestjs/common';
import ffmpegPath from 'ffmpeg-static';
import type { Env } from '../../config/env';
import { ENV } from '../../config/tokens';
import { shopOrigin } from '../../common/shop-address';
import { DrizzleBandwidthStore, DrizzleMediaStore } from '../../database/adapters/media.adapter';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { QueueModule } from '../shared/queue/queue.module';
import type { MediaEdge } from './ports/media-edge';
import type { MediaStorage } from './ports/media-storage';
import { CloudflareMediaEdge } from './providers/cloudflare-media-edge';
import { S3MediaStorage } from './providers/s3-media-storage';
import { UnconfiguredMediaEdge } from './providers/unconfigured-media-edge';
import { UnconfiguredMediaStorage } from './providers/unconfigured-media-storage';
import { ConsoleBandwidthNotifier } from './services/console-bandwidth-notifier';
import { ConsoleMediaNotifier } from './services/console-media-notifier';
import { ImageProcessor } from './services/image-processor';
import { MediaBandwidth, type BandwidthSettings } from './services/media-bandwidth';
import { MediaDeleter } from './services/media-deleter';
import { MediaEraser } from './services/media-eraser';
import { MediaLimits } from './services/media-limits';
import { MediaProcessor } from './services/media-processor';
import { MediaReconciler } from './services/media-reconciler';
import { MediaService } from './services/media.service';
import { VideoProcessor, type FfmpegSettings } from './services/video-processor';
import {
  BANDWIDTH_NOTIFIER,
  BANDWIDTH_SETTINGS,
  BANDWIDTH_STORE,
  FFMPEG,
  MEDIA_CLOCK,
  MEDIA_EDGE,
  MEDIA_NOTIFIER,
  MEDIA_STORAGE,
  MEDIA_STORE,
} from './tokens';

// Slice 6 design point 3: x264's medium pace on two threads, leaving the server's other cores to the API and the
// database (a 1-minute 1080p clip took about 70 s on a laptop core); a run past 15 minutes is stopped.
const FFMPEG_SETTINGS: FfmpegSettings = {
  path: ffmpegPath,
  threads: 2,
  preset: 'medium',
  timeoutMs: 15 * 60 * 1000,
};

/** D3-4: the S3-compatible store when one is set up (all its keys are then required, env.ts); else none. */
function mediaStorage(env: Env): MediaStorage {
  const endpoint = env.MEDIA_STORAGE_ENDPOINT;
  if (!endpoint) return new UnconfiguredMediaStorage();
  const key = (accessKeyId?: string, secretAccessKey?: string) => {
    if (!accessKeyId || !secretAccessKey) throw new Error('media storage keys are required');
    return { accessKeyId, secretAccessKey };
  };
  return new S3MediaStorage({
    endpoint,
    region: env.MEDIA_STORAGE_REGION,
    pathStyle: env.MEDIA_STORAGE_PATH_STYLE,
    uploadsBucket: env.MEDIA_UPLOADS_BUCKET,
    mediaBucket: env.MEDIA_BUCKET,
    signer: key(env.MEDIA_SIGNER_ACCESS_KEY, env.MEDIA_SIGNER_SECRET_KEY),
    processor: key(env.MEDIA_PROCESSOR_ACCESS_KEY, env.MEDIA_PROCESSOR_SECRET_KEY),
    deleter: key(env.MEDIA_DELETER_ACCESS_KEY, env.MEDIA_DELETER_SECRET_KEY),
  });
}

/** MED-10, BND-01: Cloudflare when its token is set (its account and store are then required, env.ts); else none. */
function mediaEdge(env: Env): MediaEdge {
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const kvNamespaceId = env.MEDIA_EDGE_KV_NAMESPACE_ID;
  if (!apiToken) return new UnconfiguredMediaEdge();
  if (!accountId || !kvNamespaceId) throw new Error('the media edge needs its account and store');
  return new CloudflareMediaEdge({
    accountId,
    apiToken,
    kvNamespaceId,
    dataset: env.MEDIA_USAGE_DATASET,
  });
}

// D3-4, MED-01 to MED-04, MED-09, STO-01 to STO-07: tenant media -- uploads, processing, the library, storage use, and
// deleting. It depends on catalogue (a deletion changes what the public pages show, CCH-02, and is logged like a
// catalogue change), platform settings (the per-file limits) and the queue; nothing in those depends back on it.
@Module({
  imports: [CatalogueModule, PlatformSettingsModule, QueueModule],
  providers: [
    { provide: MEDIA_STORAGE, inject: [ENV], useFactory: mediaStorage },
    { provide: MEDIA_STORE, useClass: DrizzleMediaStore },
    { provide: MEDIA_NOTIFIER, useClass: ConsoleMediaNotifier },
    { provide: FFMPEG, useValue: FFMPEG_SETTINGS },
    { provide: MEDIA_CLOCK, useValue: () => new Date() },
    { provide: MEDIA_EDGE, inject: [ENV], useFactory: mediaEdge },
    { provide: BANDWIDTH_STORE, useClass: DrizzleBandwidthStore },
    { provide: BANDWIDTH_NOTIFIER, useClass: ConsoleBandwidthNotifier },
    {
      provide: BANDWIDTH_SETTINGS,
      inject: [ENV],
      useFactory: (env: Env): BandwidthSettings => ({
        shopOrigin: (slug) => shopOrigin(env, slug),
      }),
    },
    ImageProcessor,
    VideoProcessor,
    MediaLimits,
    MediaService,
    MediaProcessor,
    MediaDeleter,
    MediaEraser,
    MediaReconciler,
    MediaBandwidth,
  ],
  exports: [
    MediaService,
    // For the processing, deletion, nightly and minute workers, and the bandwidth route.
    MediaProcessor,
    MediaDeleter,
    MediaReconciler,
    MediaBandwidth,
    // For the day-60 deletion (LIF-19).
    MediaEraser,
  ],
})
export class MediaModule {}
