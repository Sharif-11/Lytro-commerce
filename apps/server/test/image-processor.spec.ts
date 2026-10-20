import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { MediaRefused } from '../src/common/errors/media-refused';
import { ImageProcessor } from '../src/modules/media/services/image-processor';

// Phase 3 Slice 6a: what an uploaded image is stored as, and what is refused (STO-04, STO-06, MED-08). The images are
// made here, so no picture is kept in the repository.
const MB = 1024 * 1024;
const LIMIT = 5 * MB;
const processor = new ImageProcessor();

function photo(width: number, height: number, sigma: number, quality: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 140, b: 160 },
      noise: { type: 'gaussian', mean: 128, sigma },
    },
  })
    .jpeg({ quality })
    .toBuffer();
}

function refusal(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => 'accepted',
    (error: unknown) => (error instanceof MediaRefused ? error.kind : 'thrown'),
  );
}

describe('an accepted image (STO-04)', () => {
  it('stores a 4 MB phone photo smaller, as a 1600 px WebP with a 300 px thumbnail', async () => {
    const input = await photo(4000, 3000, 12, 92);
    expect(input.length).toBeGreaterThan(4 * MB);
    expect(input.length).toBeLessThan(LIMIT);
    const stored = await processor.process(input, LIMIT);
    expect(stored.format).toBe('jpeg');
    expect(stored.main).toMatchObject({ width: 1600, height: 1200 });
    expect(stored.thumbnail).toMatchObject({ width: 300, height: 225 });
    expect(stored.main.bytes + stored.thumbnail.bytes).toBeLessThan(input.length);
    expect((await sharp(stored.main.body).metadata()).format).toBe('webp');
    expect((await sharp(stored.thumbnail.body).metadata()).format).toBe('webp');
  });

  it('never enlarges a small image, and keeps a PNG transparent', async () => {
    const png = await sharp({
      create: { width: 800, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const stored = await processor.process(png, LIMIT);
    expect(stored.format).toBe('png');
    expect(stored.main).toMatchObject({ width: 800, height: 600 });
    expect((await sharp(stored.main.body).metadata()).hasAlpha).toBe(true);
    const tiny = await processor.process(
      await sharp({ create: { width: 120, height: 80, channels: 3, background: '#336699' } })
        .webp()
        .toBuffer(),
      LIMIT,
    );
    expect(tiny.format).toBe('webp');
    expect(tiny.thumbnail).toMatchObject({ width: 120, height: 80 });
  });

  it('turns a photo upright from its orientation tag, and keeps none of its hidden details', async () => {
    // A camera held sideways: stored 400 x 200, tagged to be shown turned a quarter.
    const sideways = await sharp({
      create: { width: 400, height: 200, channels: 3, background: '#884422' },
    })
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Make: 'PhoneMaker', Model: 'Phone 9' } } })
      .toBuffer();
    expect((await sharp(sideways).metadata()).exif).toBeDefined();
    const stored = await processor.process(sideways, LIMIT);
    expect(stored.main).toMatchObject({ width: 200, height: 400 });
    const kept = await sharp(stored.main.body).metadata();
    expect(kept.exif).toBeUndefined();
    expect(kept.orientation).toBeUndefined();
  });

  it('names a different picture differently, and the same picture the same (MED-08)', async () => {
    const one = await photo(640, 480, 10, 80);
    const other = await photo(640, 480, 11, 80);
    const [a, again, b] = await Promise.all([
      processor.process(one, LIMIT),
      processor.process(one, LIMIT),
      processor.process(other, LIMIT),
    ]);
    expect(a.hash).toMatch(/^[0-9a-f]{32}$/);
    expect(again.hash).toBe(a.hash);
    expect(b.hash).not.toBe(a.hash);
  });
});

describe('a refused file (STO-04, STO-06)', () => {
  it('refuses an image over 5 MB', async () => {
    const big = await photo(4000, 3000, 30, 98);
    expect(big.length).toBeGreaterThan(LIMIT);
    expect(await refusal(processor.process(big, LIMIT))).toBe('too_large');
  });

  it('judges a file by its content, never its name: a program, a page, an SVG and a GIF are refused', async () => {
    const program = Buffer.concat([
      Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'binary'),
      Buffer.alloc(2048, 7),
    ]);
    const page = Buffer.from('<!doctype html><html><body><script>alert(1)</script></body></html>');
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
    );
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } })
      .gif()
      .toBuffer();
    for (const file of [program, page, svg, gif]) {
      expect(await refusal(processor.process(file, LIMIT))).toBe('not_supported');
    }
  });

  it('refuses a JPEG cut short', async () => {
    const whole = await photo(640, 480, 10, 80);
    const cut = whole.subarray(0, Math.floor(whole.length / 2));
    expect(['unreadable', 'not_supported']).toContain(await refusal(processor.process(cut, LIMIT)));
  });
});
