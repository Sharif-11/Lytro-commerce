import { describe, expect, it } from 'vitest';
import { parseArea } from '../src/lib/area';
import { money, parseLanguage, Words } from '../src/lib/i18n/words';

describe('Words (I18N-01)', () => {
  it('is Bangla unless the shopper chose English', () => {
    expect(parseLanguage(undefined)).toBe('bn');
    expect(parseLanguage('fr')).toBe('bn');
    expect(parseLanguage('en')).toBe('en');
    expect(new Words('bn').t('add')).toBe('কার্টে রাখুন');
    expect(new Words('en').t('add')).toBe('Add to cart');
  });

  it("fills in values, and uses the app's line where the prototype's names an example shop", () => {
    const english = new Words('en');
    expect(english.t('from', { p: money('1850') })).toBe('from ৳1,850');
    expect(english.t('deliv_range', { from: money(60), to: money(150) })).toBe('৳60 – ৳150');
    expect(english.t('landing_soon')).not.toMatch(/Phase/);
    expect(new Words('bn').t('off_p')).not.toMatch(/\{s\}/);
  });

  it('writes money as the prototype does, in both languages', () => {
    expect(money('1850.00')).toBe('৳1,850');
    expect(money(12_500.5)).toBe('৳12,500.5');
  });
});

describe('parseArea (SFT-20)', () => {
  it('takes only a positive thana id', () => {
    expect(parseArea('42')).toBe(42);
    expect(parseArea('0')).toBeNull();
    expect(parseArea('-3')).toBeNull();
    expect(parseArea('4x')).toBeNull();
    expect(parseArea(undefined)).toBeNull();
  });
});
