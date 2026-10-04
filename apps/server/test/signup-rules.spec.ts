import { describe, expect, it } from 'vitest';
import { normalizeBdPhone } from '../src/identity/services/phone-number';
import {
  CODE_LENGTH,
  codeMatches,
  generateCode,
  hashCode,
} from '../src/identity/services/one-time-code';

const SECRET = 'o'.repeat(32);

describe('normalizeBdPhone (AUTH-02)', () => {
  it('accepts the local form and normalises +88 and 88 prefixes', () => {
    expect(normalizeBdPhone('01711111111')).toBe('01711111111');
    expect(normalizeBdPhone('+8801711111111')).toBe('01711111111');
    expect(normalizeBdPhone('8801711111111')).toBe('01711111111');
    expect(normalizeBdPhone('017 1111-1111')).toBe('01711111111');
  });

  it('refuses short numbers, landlines and foreign numbers', () => {
    expect(normalizeBdPhone('0171111')).toBeNull();
    expect(normalizeBdPhone('02123456789')).toBeNull();
    expect(normalizeBdPhone('+14155550100')).toBeNull();
    expect(normalizeBdPhone('0120111111')).toBeNull();
    expect(normalizeBdPhone('abcdefghijk')).toBeNull();
  });
});

describe('one-time codes (AUTH-05)', () => {
  it('generates six digits, leading zeros included', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateCode()).toMatch(new RegExp(`^\\d{${String(CODE_LENGTH)}}$`));
    }
  });

  it('matches the code for the same phone and secret', () => {
    const stored = hashCode('123456', '01711111111', SECRET);
    expect(codeMatches('123456', '01711111111', SECRET, stored)).toBe(true);
  });

  it('refuses a wrong code', () => {
    const stored = hashCode('123456', '01711111111', SECRET);
    expect(codeMatches('654321', '01711111111', SECRET, stored)).toBe(false);
  });

  it('refuses a code replayed against another phone number', () => {
    const stored = hashCode('123456', '01711111111', SECRET);
    expect(codeMatches('123456', '01811111111', SECRET, stored)).toBe(false);
  });

  it('stores a hash that does not reveal the code, and depends on the secret', () => {
    const stored = hashCode('123456', '01711111111', SECRET);
    expect(stored).not.toContain('123456');
    expect(hashCode('123456', '01711111111', 'p'.repeat(32))).not.toBe(stored);
  });
});
