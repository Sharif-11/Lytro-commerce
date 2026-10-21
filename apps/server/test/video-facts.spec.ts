import { describe, expect, it } from 'vitest';
import { readFacts } from '../src/modules/media/services/video-processor';

// STO-05: what the processing job reads in ffmpeg's report on a file. Reports as ffmpeg 6.1 writes them.
describe('reading a video by its content (STO-05)', () => {
  it('reads a portrait phone clip, turned a quarter, with its sound', () => {
    const report = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'upload':
  Metadata:
    major_brand     : isom
    com.apple.quicktime.location.ISO6709: +23.8103+090.4125/
  Duration: 00:01:00.02, start: 0.000000, bitrate: 17153 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 16955 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
      Side data:
        displaymatrix: rotation of -90.00 degrees
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 192 kb/s (default)
At least one output file must be specified`;
    expect(readFacts(report)).toEqual({
      container: 'mp4',
      videoCodec: 'h264',
      pixelFormat: 'yuv420p',
      audioCodec: 'aac',
      width: 1080,
      height: 1920,
      durationMs: 60020,
    });
  });

  it('skips a cover picture for the real video, and reads a WebM with no sound', () => {
    const withCover = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'upload':
  Duration: 00:00:05.50, start: 0.000000, bitrate: 900 kb/s
  Stream #0:0[0x1](und): Video: mjpeg (Baseline), yuvj420p(pc, bt470bg/unknown/unknown), 600x600 [SAR 1:1 DAR 1:1], 90k tbr, 90k tbn (attached pic)
  Stream #0:1[0x2](und): Video: hevc (Main) (hvc1 / 0x31637668), yuv420p(tv), 3840x2160, 800 kb/s, 30 fps
`;
    expect(readFacts(withCover)).toMatchObject({
      videoCodec: 'hevc',
      width: 3840,
      height: 2160,
      audioCodec: null,
      durationMs: 5500,
    });
    const webm = `Input #0, matroska,webm, from 'upload':
  Duration: 00:00:02.00, start: 0.000000, bitrate: 1000 kb/s
  Stream #0:0: Video: vp9 (Profile 0), yuv420p(tv, progressive), 640x360, SAR 1:1 DAR 16:9, 30 fps, 30 tbr, 1k tbn (default)
`;
    expect(readFacts(webm)).toMatchObject({
      container: 'webm',
      videoCodec: 'vp9',
      width: 640,
      height: 360,
    });
  });

  it('refuses what is not an MP4 or WebM video, and keeps a 10-bit format apart', () => {
    expect(
      readFacts(`Input #0, image2, from 'upload':
  Duration: 00:00:00.04, start: 0.000000, bitrate: 1000 kb/s
  Stream #0:0: Video: mjpeg (Baseline), yuvj420p(pc), 64x64, 25 fps`),
    ).toBeNull();
    expect(readFacts(`upload: Invalid data found when processing input`)).toBeNull();
    expect(
      readFacts(`Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'upload':
  Duration: 00:00:03.00, start: 0.000000, bitrate: 128 kb/s
  Stream #0:0[0x1](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 128 kb/s`),
    ).toBeNull();
    expect(
      readFacts(`Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'upload':
  Duration: 00:00:03.00, start: 0.000000, bitrate: 9000 kb/s
  Stream #0:0[0x1](und): Video: h264 (High 10) (avc1 / 0x31637661), yuv420p10le(tv, bt2020nc/bt2020/arib-std-b67), 1280x720, 9000 kb/s, 30 fps`),
    ).toMatchObject({ pixelFormat: 'yuv420p10le', width: 1280 });
  });
});
