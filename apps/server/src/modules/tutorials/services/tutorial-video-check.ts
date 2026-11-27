import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import {
  TUTORIAL_AUDIO_CODEC,
  TUTORIAL_MAX_BYTES,
  TUTORIAL_MAX_MB,
  TUTORIAL_VIDEO_CODEC,
  isTutorialShape,
} from '@lytronix/validators';
import { ApiError } from '../../../common/api-error';
import type { MediaStorage } from '../../media/ports/media-storage';
import { VideoProcessor } from '../../media/services/video-processor';
import { MEDIA_STORAGE } from '../../media/tokens';

// The cover, from the video's first frame: half a 1080 × 1920 file's width is sharp on any phone's list or Home, and
// small (about 40 KB).
const COVER_WIDTH = 540;
const COVER_QUALITY = 82;

/** A checked tutorial file, ready to store: the re-wrapped MP4 on disk and its JPEG cover. */
export interface CheckedTutorial {
  videoPath: string;
  bytes: number;
  width: number;
  height: number;
  durationSeconds: number;
  cover: Buffer;
}

/**
 * OPERATOR-CONSOLE-DESIGN §10h: the server's own check of an uploaded tutorial, by its content (the console checks the
 * same before it sends, for the operator's sake). Portrait 9:16, an MP4 with H.264 video and AAC sound, up to 80 MB.
 * The file is kept as it was made -- never compressed again -- only re-wrapped so it plays before it has all arrived,
 * with its metadata stripped; its length is read from it, and its first frame is the cover.
 */
@Injectable()
export class TutorialVideoCheck {
  constructor(
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(VideoProcessor) private readonly videos: VideoProcessor,
  ) {}

  async check(uploadKey: string, workDir: string): Promise<CheckedTutorial> {
    const input = join(workDir, 'upload');
    if (!(await this.storage.saveUpload(uploadKey, input))) {
      throw new ApiError('validation_error', 'TutorialFileNotUploaded', {});
    }
    if ((await stat(input)).size > TUTORIAL_MAX_BYTES) {
      throw new ApiError(
        'validation_error',
        'TutorialFileTooLarge',
        { mb: TUTORIAL_MAX_MB },
        undefined,
        { mb: TUTORIAL_MAX_MB },
      );
    }
    const facts = await this.videos.probe(input);
    if (
      facts === null ||
      facts.container !== 'mp4' ||
      facts.videoCodec !== TUTORIAL_VIDEO_CODEC ||
      facts.audioCodec !== TUTORIAL_AUDIO_CODEC
    ) {
      throw new ApiError('validation_error', 'TutorialFileNotMp4', {});
    }
    if (!isTutorialShape(facts.width, facts.height)) {
      const size = { width: facts.width, height: facts.height };
      throw new ApiError('validation_error', 'TutorialFileNotPortrait', size, undefined, size);
    }
    const videoPath = join(workDir, 'tutorial.mp4');
    if (!(await this.videos.rewrap(input, videoPath))) {
      throw new ApiError('validation_error', 'TutorialFileNotMp4', {});
    }
    const frame = await this.videos.frame(videoPath, 0);
    const cover = await sharp(frame)
      .resize({ width: COVER_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: COVER_QUALITY, mozjpeg: true })
      .toBuffer();
    return {
      videoPath,
      bytes: (await stat(videoPath)).size,
      width: facts.width,
      height: facts.height,
      durationSeconds: Math.max(1, Math.round(facts.durationMs / 1000)),
      cover,
    };
  }
}
