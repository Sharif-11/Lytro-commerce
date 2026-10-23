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

  it("knows the address's own shape, and leaves whether it is free to the server", () => {
    expect(slug.isWellFormed('')).toBe(false);
    expect(slug.isWellFormed('ab')).toBe(false);
    expect(slug.isWellFormed('-megh')).toBe(false);
    expect(slug.isWellFormed('megh-')).toBe(false);
    expect(slug.isWellFormed('megh')).toBe(true);
    // Reserved names are well formed; the server's check says they are not free (TEN-26).
    expect(slug.isWellFormed('admin')).toBe(true);
  });
});
