import { describe, expect, it } from 'vitest';
import { maskedPhone, phoneShown, phoneShownInternational } from '../src';

// The owner, 2026-11-25: "don't [use whitespace in phone numbers], all digit are together everywhere".
describe('a phone number as it is shown', () => {
  it('shows a Bangladeshi mobile in its local form, one run of digits, however it was written', () => {
    for (const written of [
      '01711234567',
      '+8801711234567',
      '8801711234567',
      '1711234567',
      '01711 234 567',
      '01711-234567',
      ' +880 1711-234 567 ',
    ]) {
      expect(phoneShown(written)).toBe('01711234567');
    }
  });

  it('keeps any other number as its digits, with its leading + if it had one', () => {
    expect(phoneShown('01911 0000001')).toBe('019110000001');
    expect(phoneShown('+44 20 7946 0958')).toBe('+442079460958');
    expect(phoneShown('')).toBe('');
  });

  it('writes the country code with no space after it', () => {
    expect(phoneShownInternational('01711 234 567')).toBe('+8801711234567');
    expect(phoneShownInternational('+8801711234567')).toBe('+8801711234567');
    expect(phoneShownInternational('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('masks a locked order’s phone as one run too: its first and last three digits', () => {
    expect(maskedPhone('01711234842')).toBe('017•••••842');
    expect(maskedPhone('+880 1711-234842')).toBe('017•••••842');
    expect(maskedPhone('01711234842')).not.toMatch(/\s/);
  });
});
