import { describe, expect, it } from 'vitest';
import { landingPath, productPath } from '../src/lib/design/card-links';
import { keptQuery, slugOfSegment } from '../src/lib/request-path';

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

// The owner, 2026-11-25: a product's links name its ID, so a Bangla name never makes a long link; a slug from a link
// made before is led to the ID's link with its whole query.
describe("a product's address for a link or a redirect", () => {
  const ID = '0b8f3c52-1e6a-4d7b-9c2f-8a5e3d1b6c40';

  it('names the product by its ID, in ASCII for the Location header', () => {
    expect(productPath(ID)).toBe(`/p/${ID}`);
    expect(landingPath(ID)).toBe(`/l/${ID}`);
    expect(productPath(ID)).toMatch(/^[\x20-\x7e]+$/);
  });

  it('keeps the whole query: the variant, the design and an ad click', () => {
    expect(keptQuery({ v: 'v-1', d: 'd 2', fbclid: 'IwAR' })).toBe('?v=v-1&d=d+2&fbclid=IwAR');
    expect(keptQuery({ utm: ['a', 'b'], none: undefined })).toBe('?utm=a&utm=b');
    expect(keptQuery({})).toBe('');
  });
});
