import { describe, expect, it } from 'vitest';
import { MediaKind } from '@lytronix/validators';
import { MediaLinks, largeImageUrlOf, mediaKeys } from '../src/common/media-links';

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
