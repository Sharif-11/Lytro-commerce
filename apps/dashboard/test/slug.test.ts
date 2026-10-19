import { describe, expect, it } from 'vitest';
import { ShopSlug } from '../src/lib/slug';

const slug = new ShopSlug();

describe('ShopSlug', () => {
  it('suggests an address from the Latin letters of a name, empty for Bangla-only names', () => {
    expect(slug.suggest("Rahim's Gadgets")).toBe('rahim-s-gadgets');
    expect(slug.suggest('মেঘ ফ্যাশন')).toBe('');
    expect(slug.suggest('Megh Fashion ঢাকা')).toBe('megh-fashion');
  });

  it('cuts a long suggestion at a word boundary within the limit', () => {
    const long = slug.suggest('abcdefghij klmnopqrst uvwxyzabcd efgh');
    expect(long.length).toBeLessThanOrEqual(30);
    expect(long.endsWith('-')).toBe(false);
  });

  it('normalises typing to lowercase letters, digits and single hyphens', () => {
    expect(slug.normaliseTyping('Megh Shop!!')).toBe('megh-shop-');
    expect(slug.normaliseTyping('MEGH--2')).toBe('megh-2');
  });

  it('judges format and reserved names the way the server does', () => {
    expect(slug.verdict('')).toBe('empty');
    expect(slug.verdict('ab')).toBe('invalid');
    expect(slug.verdict('-megh')).toBe('invalid');
    expect(slug.verdict('admin')).toBe('reserved');
    expect(slug.verdict('megh')).toBe('ok');
  });

  it('offers the next free suggestion without stacking suffixes', () => {
    expect(slug.nextSuggestion('megh')).toBe('megh-2');
    expect(slug.nextSuggestion('megh-2')).toBe('megh-3');
  });
});
