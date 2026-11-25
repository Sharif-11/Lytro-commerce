import { describe, expect, it } from 'vitest';
import { BangladeshiPhone } from '../src/lib/phone';

const phone = new BangladeshiPhone();

// The owner, 2026-11-25: the box takes the number as typed, from 0 -- no fixed +880 before it.
describe('BangladeshiPhone', () => {
  it('reads a mobile number however it is written, for the server as +880…', () => {
    for (const typed of [
      '01712345678',
      '1712345678',
      '8801712345678',
      '+8801712345678',
      '01712-345678',
      '017 1234 5678',
      ' +880 1712-345 678 ',
      '+88 01712345678',
    ]) {
      expect(phone.read(typed), typed).toBe('+8801712345678');
      expect(phone.localOf(typed), typed).toBe('01712345678');
    }
  });

  it('reads nothing that is not a Bangladeshi mobile number', () => {
    for (const typed of [
      '',
      '0171234567',
      '017123456789',
      '01212345678',
      '1212345678',
      '+8801212345678',
      '+88017123',
      '02712345678',
      '017l2345678',
      '+1 415 555 0100',
    ]) {
      expect(phone.read(typed), typed).toBeNull();
      expect(phone.localOf(typed), typed).toBeNull();
    }
  });

  it('shows a saved number in a field as people write it', () => {
    expect(phone.forField('+8801712345678')).toBe('01712345678');
    expect(phone.forField('01712345678')).toBe('01712345678');
    expect(phone.forField('+88017')).toBe('+88017');
  });

  it('shows a number as one run of digits, local or with +880, and for WhatsApp (the owner, 2026-11-25)', () => {
    expect(phone.display('+8801712345678')).toBe('01712345678');
    expect(phone.forWhatsapp('01712345678')).toBe('8801712345678');
    expect(phone.international('+8801711234567')).toBe('+8801711234567');
    expect(phone.international('+88017')).toBe('+88017');
  });
});
