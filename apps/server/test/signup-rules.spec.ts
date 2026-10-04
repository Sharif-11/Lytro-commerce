import { describe, expect, it } from 'vitest';
import { PhoneNumberFormat } from '../src/identity/services/phone-number-format';
import { CODE_LENGTH, OneTimeCodeHasher } from '../src/identity/services/one-time-code-hasher';

const phoneFormat = new PhoneNumberFormat();

const SECRET = 'o'.repeat(32);
const OTHER_SECRET = 'p'.repeat(32);

describe('normalizeBdPhone (AUTH-02)', () => {
  it('accepts the local form and normalises +88 and 88 prefixes', () => {
    expect(phoneFormat.normalize('01711111111')).toBe('01711111111');
    expect(phoneFormat.normalize('+8801711111111')).toBe('01711111111');
    expect(phoneFormat.normalize('8801711111111')).toBe('01711111111');
    expect(phoneFormat.normalize('017 1111-1111')).toBe('01711111111');
  });

  it('refuses short numbers, landlines and foreign numbers', () => {
    expect(phoneFormat.normalize('0171111')).toBeNull();
    expect(phoneFormat.normalize('02123456789')).toBeNull();
    expect(phoneFormat.normalize('+14155550100')).toBeNull();
    expect(phoneFormat.normalize('0120111111')).toBeNull();
    expect(phoneFormat.normalize('abcdefghijk')).toBeNull();
  });
});

describe('one-time codes (AUTH-05)', () => {
  it('generates six digits, leading zeros included', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(new OneTimeCodeHasher(SECRET).generate()).toMatch(
        new RegExp(`^\\d{${String(CODE_LENGTH)}}$`),
      );
    }
  });

  it('matches the code for the same phone and secret', () => {
    const stored = new OneTimeCodeHasher(SECRET).hash('123456', '01711111111');
    expect(new OneTimeCodeHasher(SECRET).matches('123456', '01711111111', stored)).toBe(true);
  });

  it('refuses a wrong code', () => {
    const stored = new OneTimeCodeHasher(SECRET).hash('123456', '01711111111');
    expect(new OneTimeCodeHasher(SECRET).matches('654321', '01711111111', stored)).toBe(false);
  });

  it('refuses a code replayed against another phone number', () => {
    const stored = new OneTimeCodeHasher(SECRET).hash('123456', '01711111111');
    expect(new OneTimeCodeHasher(SECRET).matches('123456', '01811111111', stored)).toBe(false);
  });

  it('stores a hash that does not reveal the code, and depends on the secret', () => {
    const stored = new OneTimeCodeHasher(SECRET).hash('123456', '01711111111');
    expect(stored).not.toContain('123456');
    expect(new OneTimeCodeHasher(OTHER_SECRET).hash('123456', '01711111111')).not.toBe(stored);
  });
});
