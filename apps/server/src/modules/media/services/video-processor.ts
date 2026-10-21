import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { MediaRefused } from '../../../common/errors/media-refused';
import { FFMPEG } from '../tokens';

/** How the media job runs ffmpeg (Slice 6 design points 2 and 3): the pinned binary, its threads and its pace. */
export interface FfmpegSettings {
  /** The ffmpeg-static binary; null where the package ships none, and then no video can be processed. */
  path: string | null;
  threads: number;
  preset: string;
  timeoutMs: number;
}

/** What ffmpeg reads in a file (STO-05): its container, its streams, its size as shown and its length. */
export interface VideoFacts {
  container: 'mp4' | 'webm';
  videoCodec: string;
  pixelFormat: string | null;
  audioCodec: string | null;
  width: number;
  height: number;
  durationMs: number;
}

/** A video ready to store (STO-09): the MP4 and its poster, with the fingerprint their names carry. */
export interface ProcessedVideo {
  video: { path: string; bytes: number; width: number; height: number; durationMs: number };
  poster: { body: Buffer; bytes: number };
  hash: string;
  /** STO-09's exception: the original's own streams, re-wrapped only so it plays before it has all arrived. */
  keptOriginal: boolean;
}

// STO-09: the long edge at most 1280 px, never upscaled; constant quality 23; AAC at 128 kbps; fast start.
const LONG_EDGE = 1280;
const CRF = '23';
const AUDIO_BITRATE = '128k';
const POSTER_QUALITY = 80;
// The poster is the frame at one second in, or the middle of a shorter clip.
const POSTER_AT_MS = 1000;
// Pixel formats every browser plays; a kept original must be one of them.
const PLAYABLE_PIXELS = ['yuv420p', 'yuvj420p'];
// Width and height, both even (H.264 in 4:2:0 needs them so), the long edge at most LONG_EDGE.
const SCALE = [
  `scale='if(gte(iw,ih),trunc(min(${String(LONG_EDGE)},iw)/2)*2,-2)'`,
  `'if(gte(iw,ih),-2,trunc(min(${String(LONG_EDGE)},ih)/2)*2)'`,
].join(':');

/** A run of ffmpeg: how it ended, what it wrote out, and what it said. */
interface Run {
  code: number | null;
  stdout: Buffer;
  stderr: string;
}

/**
 * STO-05, STO-09: judges a video by its content and compresses it to H.264 and AAC in an MP4 that plays before it has
 * all arrived, with a WebP poster. When the original is already an H.264 MP4 within the size bound, plays in every
 * browser, and is smaller than the compressed result, its streams are kept as they are. Anything ffmpeg cannot read as
 * an MP4 or WebM video is refused as not a video; one it cannot decode, as unreadable.
 */
@Injectable()
export class VideoProcessor {
  constructor(@Inject(FFMPEG) private readonly ffmpeg: FfmpegSettings) {}

  async process(input: string, workDir: string, maxBytes: number): Promise<ProcessedVideo> {
    if ((await stat(input)).size > maxBytes) throw new MediaRefused('too_large');
    const facts = await this.probe(input);
    if (!facts) throw new MediaRefused('not_supported');

    const compressed = join(workDir, 'compressed.mp4');
    await this.compress(input, compressed);
    let chosen = compressed;
    let keptOriginal = false;
    if (this.mayKeep(facts)) {
      const kept = join(workDir, 'kept.mp4');
      if ((await this.run(this.rewrapArgs(input, kept))).code === 0) {
        if ((await stat(kept)).size < (await stat(compressed)).size) {
          chosen = kept;
          keptOriginal = true;
        }
      }
    }

    const stored = await this.probe(chosen);
    if (!stored) throw new MediaRefused('unreadable');
    const frame = await this.frame(
      chosen,
      Math.min(POSTER_AT_MS, Math.floor(stored.durationMs / 2)),
    );
    const poster = await sharp(frame).webp({ quality: POSTER_QUALITY }).toBuffer();
    return {
      video: {
        path: chosen,
        bytes: (await stat(chosen)).size,
        width: stored.width,
        height: stored.height,
        durationMs: stored.durationMs,
      },
      poster: { body: poster, bytes: poster.length },
      hash: await this.fingerprint(chosen),
      keptOriginal,
    };
  }

  /** STO-05: what the file is, from its content; null when it is not an MP4 or WebM with a video in it. */
  async probe(path: string): Promise<VideoFacts | null> {
    const { stderr } = await this.run(['-hide_banner', '-nostdin', '-i', path]);
    return readFacts(stderr);
  }

  private async compress(input: string, output: string): Promise<void> {
    const run = await this.run([
      '-hide_banner',
      '-nostdin',
      '-loglevel',
      'error',
      '-y',
      '-i',
      input,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      // Stripped like an image's metadata: a phone video can carry where it was shot.
      '-map_metadata',
      '-1',
      '-map_chapters',
      '-1',
      '-vf',
      SCALE,
      '-c:v',
      'libx264',
      '-preset',
      this.ffmpeg.preset,
      '-crf',
      CRF,
      '-pix_fmt',
      'yuv420p',
      '-threads',
      String(this.ffmpeg.threads),
      '-c:a',
      'aac',
      '-b:a',
      AUDIO_BITRATE,
      '-movflags',
      '+faststart',
      '-max_muxing_queue_size',
      '1024',
      '-f',
      'mp4',
      output,
    ]);
    if (run.code !== 0) throw new MediaRefused('unreadable');
  }

  /** STO-09's exception applies only to an H.264 MP4 within the size bound, every browser plays, with AAC or no sound. */
  private mayKeep(facts: VideoFacts): boolean {
    return (
      facts.container === 'mp4' &&
      facts.videoCodec === 'h264' &&
      Math.max(facts.width, facts.height) <= LONG_EDGE &&
      facts.pixelFormat !== null &&
      PLAYABLE_PIXELS.includes(facts.pixelFormat) &&
      (facts.audioCodec === null || facts.audioCodec === 'aac')
    );
  }

  private rewrapArgs(input: string, output: string): string[] {
    return [
      '-hide_banner',
      '-nostdin',
      '-loglevel',
      'error',
      '-y',
      '-i',
      input,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-c',
      'copy',
      '-map_metadata',
      '-1',
      '-map_chapters',
      '-1',
      '-movflags',
      '+faststart',
      '-f',
      'mp4',
      output,
    ];
  }

  /** One frame of the video, as a PNG, for its poster. */
  private async frame(path: string, atMs: number): Promise<Buffer> {
    const run = await this.run(
      [
        '-hide_banner',
        '-nostdin',
        '-loglevel',
        'error',
        '-ss',
        (atMs / 1000).toFixed(3),
        '-i',
        path,
        '-frames:v',
        '1',
        '-f',
        'image2pipe',
        '-c:v',
        'png',
        '-',
      ],
      true,
    );
    if (run.code !== 0 || run.stdout.length === 0) throw new MediaRefused('unreadable');
    return run.stdout;
  }

  /** MED-08: the fingerprint the stored names carry, the same length as an image's. */
  private async fingerprint(path: string): Promise<string> {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
    return hash.digest('hex').slice(0, 32);
  }

  private run(args: string[], keepStdout = false): Promise<Run> {
    const binary = this.ffmpeg.path;
    if (binary === null)
      return Promise.reject(new Error('ffmpeg-static has no binary for this platform'));
    return new Promise((resolve, reject) => {
      const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      const stdout: Buffer[] = [];
      let stderr = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), this.ffmpeg.timeoutMs);
      child.stdout.on('data', (chunk: Buffer) => {
        if (keepStdout) stdout.push(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        // What ffmpeg reports about a file comes first; the rest is not needed.
        if (stderr.length < 64_000) stderr += chunk.toString();
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout: Buffer.concat(stdout), stderr });
      });
    });
  }
}

/**
 * STO-05: reads ffmpeg's report on its input: the container family, the first real video stream (not a cover picture),
 * the first audio stream, the length, and the size as shown, a quarter turn swapping width and height.
 */
export function readFacts(report: string): VideoFacts | null {
  const formats = /^Input #0, ([\w,]+), from /m.exec(report)?.[1]?.split(',') ?? [];
  const container = formats.includes('mp4') ? 'mp4' : formats.includes('webm') ? 'webm' : null;
  if (container === null) return null;

  const video = [...report.matchAll(/Stream #0:\d+[^:\n]*: Video: (\w+)([^\n]*)/g)].find(
    (match) => !(match[2] ?? '').includes('attached pic'),
  );
  if (!video) return null;
  const details = video[2] ?? '';
  const size = /\b(\d{2,5})x(\d{2,5})\b/.exec(details);
  const duration = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(report);
  if (!size || !duration) return null;

  const durationMs = Math.round(
    (Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])) * 1000,
  );
  if (!(durationMs > 0)) return null;
  const rotation = Number(/rotation of (-?\d+(?:\.\d+)?) degrees/.exec(report)?.[1] ?? '0');
  const turned = Math.abs(Math.round(rotation)) % 180 === 90;
  const width = Number(size[1]);
  const height = Number(size[2]);
  return {
    container,
    videoCodec: video[1] ?? '',
    pixelFormat: /\b(yuvj?4\d{2}p\w*|nv12|gray\w*|rgb\w*|bgr\w*)/.exec(details)?.[1] ?? null,
    audioCodec: /Stream #0:\d+[^:\n]*: Audio: (\w+)/.exec(report)?.[1] ?? null,
    width: turned ? height : width,
    height: turned ? width : height,
    durationMs,
  };
}
