import { describe, expect, it } from 'vitest';
import { ClaimSlug } from '../src/lib/claim-slug';

const claim = new ClaimSlug();

describe('ClaimSlug', () => {
  it('lowercases and turns runs of other characters into one hyphen', () => {
    expect(claim.normalise("Rahim's Gadgets")).toBe('rahim-s-gadgets');
    expect(claim.normalise('  Nisha  Closet ')).toBe('nisha-closet');
  });

  it('never starts or ends with a hyphen, even after cutting to the maximum length', () => {
    expect(claim.normalise('--shop--')).toBe('shop');
    const long = claim.normalise('abcdefghij-abcdefghij-abcdefgh-ij');
    expect(long.length).toBeLessThanOrEqual(30);
    expect(long.endsWith('-')).toBe(false);
  });

  it('accepts only what the shared shop-link rule accepts', () => {
    expect(claim.isValid('rahim-gadgets')).toBe(true);
    expect(claim.isValid('ab')).toBe(false);
    expect(claim.isValid('Rahim')).toBe(false);
    expect(claim.isValid('-shop')).toBe(false);
  });
});
