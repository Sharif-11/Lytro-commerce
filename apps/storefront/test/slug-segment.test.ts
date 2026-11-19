import { describe, expect, it } from 'vitest';
import { pathOfSlug, slugOfSegment } from '../src/lib/request-path';

// A Bangla product's or category's address reaches its page percent-encoded; the slug the API knows is decoded once
// (staging, 2026-11-19: every Bangla product and category page answered 404).

describe("a page's slug from its address", () => {
  it('decodes a Bangla slug once', () => {
    expect(slugOfSegment(encodeURIComponent('অর্গানজা-পার্টি-শাড়ি'))).toBe(
      'অর্গানজা-পার্টি-শাড়ি',
    );
  });

  it('leaves a plain slug as it is', () => {
    expect(slugOfSegment('cotton-panjabi')).toBe('cotton-panjabi');
  });

  it('keeps a broken escape as typed', () => {
    expect(slugOfSegment('%E0%A6')).toBe('%E0%A6');
  });
});

describe("a slug's address for a redirect", () => {
  it('encodes a Bangla slug, so the Location header is ASCII', () => {
    const path = pathOfSlug('/p', 'অর্গানজা-শাড়ি');
    expect(path).toMatch(/^[\x20-\x7e]+$/);
    expect(decodeURIComponent(path)).toBe('/p/অর্গানজা-শাড়ি');
  });

  it('leaves a plain slug readable', () => {
    expect(pathOfSlug('/l', 'cotton-panjabi')).toBe('/l/cotton-panjabi');
  });
});
