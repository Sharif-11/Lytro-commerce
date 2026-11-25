import { describe, expect, it } from 'vitest';
import { MediaKind } from '@lytronix/validators';
import { MediaLinks, coverOf, largeImageUrlOf, mediaKeys } from '../src/common/media-links';

// MED-08 (fixes 2026-11-14): an order line keeps its picture's thumbnail link; the seller sees the same picture large,
// read from the link that differs only in its ending.
describe('the large picture behind a thumbnail (MED-08)', () => {
  const links = new MediaLinks({ MEDIA_PUBLIC_BASE_URL: 'https://media.lytro.app/' });

  it("gives an image's full WebP for its thumbnail", () => {
    const urls = links.urls(MediaKind.Image, 'shop-1', 'media-1', 'abc123');
    expect(largeImageUrlOf(urls.thumbnail)).toBe(urls.main);
    expect(urls.main).toBe('https://media.lytro.app/tenants/shop-1/media-1/abc123.webp');
  });

  it('agrees with the stored names', () => {
    const keys = mediaKeys(MediaKind.Image, 't', 'm', 'h');
    expect(largeImageUrlOf(keys.thumbnail)).toBe(keys.main);
  });

  it('keeps a link of any other shape as it is', () => {
    expect(largeImageUrlOf('https://cdn.example/picture.jpg')).toBe(
      'https://cdn.example/picture.jpg',
    );
    expect(largeImageUrlOf('/tenants/t/m/h.poster.webp')).toBe('/tenants/t/m/h.poster.webp');
  });
});

// STO-09 (the owner, 2026-11-25): a product with only a video showed a play mark on an empty picture.
describe("a product's cover (STO-09)", () => {
  const links = new MediaLinks({ MEDIA_PUBLIC_BASE_URL: 'https://media.lytro.app' });
  const photo = links.image('shop-1', 'photo-1', 'p1');
  const video = links.video('shop-1', 'video-1', 'v1');

  it('is the first photo, whether or not there is a video', () => {
    const second = links.image('shop-1', 'photo-2', 'p2');
    expect(coverOf([photo, second], video)).toEqual(photo);
    expect(coverOf([photo], null)).toEqual(photo);
  });

  it("is the video's poster, large and small, for a product with no photo", () => {
    expect(coverOf([], video)).toEqual({
      id: 'video-1',
      urls: {
        main: 'https://media.lytro.app/tenants/shop-1/video-1/v1.poster.webp',
        thumbnail: 'https://media.lytro.app/tenants/shop-1/video-1/v1.poster.webp',
      },
    });
  });

  it('is nothing with neither', () => {
    expect(coverOf([], null)).toBeNull();
  });

  it('carries only the picture, not the rest of a photo row', () => {
    const row = { ...photo, width: 800, height: 1000, designId: 'design-1' };
    expect(coverOf([row], null)).toEqual(photo);
  });
});
