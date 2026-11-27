// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fakeMp4, type FakeMp4 } from '../e2e/support/fake-mp4';
import { checksOf, readTutorialFile } from '../src/lib/tutorial-file';

// OPERATOR-CONSOLE-DESIGN §10h: the console reads a chosen file's size, length and codecs from its own boxes.

async function read(spec: FakeMp4) {
  return readTutorialFile(
    new File([new Uint8Array(fakeMp4(spec))], 'clip.mp4', { type: 'video/mp4' }),
  );
}

describe("a chosen tutorial file's checks", () => {
  it('passes a portrait 9:16 H.264 and AAC MP4, with its length and size', async () => {
    const facts = await read({ width: 1080, height: 1920, seconds: 155, mb: 21 });
    expect(facts).toMatchObject({
      width: 1080,
      height: 1920,
      durationSeconds: 155,
      mp4: true,
      videoCodec: true,
      audioCodec: true,
    });
    expect(Math.round(facts.bytes / (1024 * 1024))).toBe(21);
    expect(checksOf(facts)).toEqual({ shape: true, codecs: true, size: true });
  });

  it('refuses landscape, another codec, no sound and over 80 MB, each on its own line', async () => {
    expect(checksOf(await read({ width: 1920, height: 1080, seconds: 5 })).shape).toBe(false);
    expect(
      checksOf(await read({ width: 1080, height: 1920, seconds: 5, video: 'hvc1' })).codecs,
    ).toBe(false);
    expect(
      checksOf(await read({ width: 1080, height: 1920, seconds: 5, audio: null })).codecs,
    ).toBe(false);
    expect(checksOf(await read({ width: 1080, height: 1920, seconds: 5, mb: 81 })).size).toBe(
      false,
    );
  });

  it('reads a file that is not an MP4 as not one', async () => {
    const facts = await readTutorialFile(
      new File([new TextEncoder().encode('not a video at all')], 'x.mp4'),
    );
    expect(facts).toMatchObject({ mp4: false, width: null, durationSeconds: null });
    expect(checksOf(facts)).toEqual({ shape: false, codecs: false, size: true });
  });
});
